import {clampRefreshMinutes, placeKey} from './settings.js';
import {evaluateCache} from './cache.js';

export class WeatherError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

export async function refreshWeather({
    fetchJson,
    provider,
    location,
    cache,
    nowMs,
    intervalMinutes,
    force = false,
}) {
    if (!location) {
        return {
            status: 'unconfigured',
            report: null,
            cache,
            errorCode: null,
            fromCache: false,
        };
    }
    if (!provider) {
        return {
            status: 'unavailable',
            report: null,
            cache,
            errorCode: 'invalid',
            fromCache: false,
        };
    }

    const key = placeKey(location);
    const intervalMs = clampRefreshMinutes(intervalMinutes) * 60 * 1000;
    const cached = evaluateCache(cache, key, provider.id, nowMs, intervalMs);

    if (cached.fresh && !force) {
        return {
            status: 'live',
            report: cache.report,
            cache,
            errorCode: null,
            fromCache: true,
        };
    }

    try {
        const raw = await fetchJson(provider.forecastUrl(location));
        const parsed = provider.parseForecast(raw);
        if (!parsed.ok || !parsed.report) {
            if (cached.usable) {
                return {
                    status: 'stale',
                    report: cache.report,
                    cache,
                    errorCode: 'invalid',
                    fromCache: true,
                };
            }
            return {
                status: 'unavailable',
                report: null,
                cache: cached.usable ? cache : null,
                errorCode: 'invalid',
                fromCache: false,
            };
        }

        const next = {
            savedAtMs: nowMs,
            placeKey: key,
            providerId: provider.id,
            report: parsed.report,
        };
        return {
            status: 'live',
            report: parsed.report,
            cache: next,
            errorCode: null,
            fromCache: false,
        };
    } catch (error) {
        const code = error && error.code ? error.code : 'network';
        if (cached.usable) {
            return {
                status: 'stale',
                report: cache.report,
                cache,
                errorCode: code,
                fromCache: true,
            };
        }
        return {
            status: 'unavailable',
            report: null,
            cache: null,
            errorCode: code,
            fromCache: false,
        };
    }
}
