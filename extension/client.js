import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {REQUEST_TIMEOUT_SECONDS, USER_AGENT} from './lib/constants.js';
import {deserializeCache, serializeCache} from './lib/cache.js';
import {parseReverseGeocode, reverseGeocodeUrl} from './lib/geocode.js';
import {WeatherError, refreshWeather} from './lib/refresh.js';
import {getFallbacks, getProvider} from './lib/provider.js';
import {clampRefreshMinutes, locationFromState, placeKey} from './lib/settings.js';
import {evaluateCache} from './lib/cache.js';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async');

function hostOf(url) {
    try {
        return GLib.Uri.parse(url, GLib.UriFlags.NONE).get_host() || 'unknown-host';
    } catch {
        return 'unknown-host';
    }
}

export class SoupJsonClient {
    constructor(logger) {
        this._logger = logger;
        this._session = new Soup.Session({
            timeout: REQUEST_TIMEOUT_SECONDS,
            user_agent: USER_AGENT,
        });
    }

    async getJson(url) {
        const host = hostOf(url);
        const message = Soup.Message.new('GET', url);
        if (!message)
            throw new WeatherError('network');

        let bytes;
        try {
            bytes = await this._session.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                null);
        } catch (error) {
            this._logger?.warn?.(`Network error contacting ${host}: ${error?.message || 'failed'}`);
            throw new WeatherError('network');
        }

        const status = message.get_status();
        if (status === 429) {
            this._logger?.warn?.(`Rate limited by ${host}`);
            throw new WeatherError('rate-limit');
        }
        if (status < 200 || status >= 300) {
            this._logger?.warn?.(`HTTP ${status} from ${host}`);
            throw new WeatherError(status >= 500 ? 'network' : 'invalid');
        }

        const data = bytes?.get_data?.();
        if (!data || data.length === 0)
            throw new WeatherError('invalid');
        try {
            return JSON.parse(new TextDecoder().decode(data));
        } catch {
            this._logger?.warn?.(`Invalid JSON from ${host}`);
            throw new WeatherError('invalid');
        }
    }

    destroy() {
        this._session?.abort();
        this._session = null;
    }
}

function cacheFile() {
    const directory = Gio.File.new_for_path(GLib.build_filenamev([
        GLib.get_user_cache_dir(),
        'ubuntu-weather-indicator',
    ]));
    try {
        if (!directory.query_exists(null))
            directory.make_directory_with_parents(null);
    } catch (error) {
        return null;
    }
    return directory.get_child('last.json');
}

export class WeatherService {
    constructor(logger) {
        this._logger = logger;
        this._client = new SoupJsonClient(logger);
        this._cache = this._loadCache();
    }

    _loadCache() {
        const file = cacheFile();
        if (!file || !file.query_exists(null))
            return null;
        try {
            const [, contents] = file.load_contents(null);
            const text = new TextDecoder().decode(contents);
            const cache = deserializeCache(text);
            if (!cache)
                this._logger?.warn?.('Ignored unreadable weather cache');
            return cache;
        } catch (error) {
            this._logger?.warn?.(`Could not read weather cache: ${error?.message || 'failed'}`);
            return null;
        }
    }

    _store(cache) {
        this._cache = cache;
        const file = cacheFile();
        if (!file)
            return;
        try {
            file.replace_contents(
                new TextEncoder().encode(serializeCache(cache)),
                null,
                false,
                Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION,
                null);
        } catch (error) {
            this._logger?.warn?.(`Could not write weather cache: ${error?.message || 'failed'}`);
        }
    }

    peek(location, state) {
        const provider = getProvider(state.provider);
        if (!location || !provider || !this._cache)
            return null;
        const accepted = [provider.id, ...getFallbacks(provider.id).map(item => item.id)];
        const intervalMs = clampRefreshMinutes(state.refreshMinutes) * 60 * 1000;
        const verdict = evaluateCache(
            this._cache,
            placeKey(location),
            accepted,
            Date.now(),
            intervalMs);
        if (!verdict.usable)
            return null;
        return {
            fresh: verdict.fresh,
            report: this._cache.report,
            updatedAtMs: this._cache.savedAtMs,
            providerId: this._cache.providerId,
        };
    }

    async searchCities(query, locale) {
        const provider = getProvider('open-meteo');
        if (!provider)
            return [];
        const payload = await this._client.getJson(provider.geocodingUrl(query, locale));
        return provider.parseGeocoding(payload);
    }

    async lookupPlace(latitude, longitude, locale) {
        const payload = await this._client.getJson(reverseGeocodeUrl(latitude, longitude, locale));
        return parseReverseGeocode(payload);
    }

    refresh(args) {
        if (this._inflight)
            return this._inflight;
        this._inflight = this._refresh(args).finally(() => {
            this._inflight = null;
        });
        return this._inflight;
    }

    async _refresh({state, force = false}) {
        const location = locationFromState(state);
        const provider = getProvider(state.provider);
        const result = await refreshWeather({
            fetchJson: url => this._client.getJson(url),
            provider,
            fallbacks: provider ? getFallbacks(provider.id) : [],
            location,
            cache: this._cache,
            nowMs: Date.now(),
            intervalMinutes: state.refreshMinutes,
            force,
        });
        if (result.cache && !result.fromCache && result.status === 'live')
            this._store(result.cache);
        const updatedAtMs = result.report && result.cache ? result.cache.savedAtMs : null;
        return {
            status: result.status,
            errorCode: result.errorCode,
            report: result.report,
            location,
            providerId: result.providerId,
            updatedAt: updatedAtMs ? new Date(updatedAtMs).toISOString() : null,
        };
    }

    destroy() {
        this._client?.destroy();
        this._client = null;
        this._cache = null;
        this._logger = null;
    }
}
