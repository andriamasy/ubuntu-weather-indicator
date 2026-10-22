import {isValidReport} from './parse.js';

export function evaluateCache(cache, key, providerId, nowMs, intervalMs) {
    if (!cache || cache.placeKey !== key || cache.providerId !== providerId)
        return {usable: false, fresh: false};
    if (!isValidReport(cache.report) || !Number.isFinite(cache.savedAtMs))
        return {usable: false, fresh: false};
    const age = nowMs - cache.savedAtMs;
    if (!Number.isFinite(age) || age < 0)
        return {usable: true, fresh: false};
    return {usable: true, fresh: age < intervalMs};
}

export function deserializeCache(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        return null;
    }
    if (!data || typeof data !== 'object')
        return null;
    if (typeof data.placeKey !== 'string' || typeof data.providerId !== 'string')
        return null;
    if (!Number.isFinite(data.savedAtMs) || !isValidReport(data.report))
        return null;
    return {
        savedAtMs: data.savedAtMs,
        placeKey: data.placeKey,
        providerId: data.providerId,
        report: data.report,
    };
}

export function serializeCache(cache) {
    return JSON.stringify(cache);
}
