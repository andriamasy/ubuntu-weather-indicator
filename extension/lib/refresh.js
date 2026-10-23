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
    fallbacks = [],
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
    const candidates = [provider, ...(fallbacks || [])].filter(Boolean);
    const accepted = [...new Set(candidates.map(item => item.id))];
    const cached = evaluateCache(cache, key, accepted, nowMs, intervalMs);

    if (cached.fresh && !force) {
        return {
            status: 'live',
            report: cache.report,
            cache,
            errorCode: null,
            fromCache: true,
            providerId: cache.providerId,
        };
    }

    let lastCode = 'network';
    for (const candidate of candidates) {
        try {
            const raw = await fetchJson(candidate.forecastUrl(location));
            const parsed = candidate.parseForecast(raw);
            if (!parsed.ok || !parsed.report)
                throw new WeatherError('invalid');
            const next = {
                savedAtMs: nowMs,
                placeKey: key,
                providerId: candidate.id,
                report: parsed.report,
            };
            return {
                status: 'live',
                report: parsed.report,
                cache: next,
                errorCode: null,
                fromCache: false,
                providerId: candidate.id,
            };
        } catch (error) {
            lastCode = error && error.code ? error.code : 'network';
        }
    }

    if (cached.usable) {
        return {
            status: 'stale',
            report: cache.report,
            cache,
            errorCode: lastCode,
            fromCache: true,
            providerId: cache.providerId,
        };
    }
    return {
        status: 'unavailable',
        report: null,
        cache: null,
        errorCode: lastCode,
        fromCache: false,
        providerId: null,
    };
}
