import {clampAlertHours} from './settings.js';
import {forecastHourKey, hourKey, hourLabel} from './time.js';

const RAIN_CODES = new Set([
    51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99,
]);
const RAIN_PROBABILITY = 40;
const CYCLONE_WIND_KMH = 118;

function zoneOf(report) {
    if (typeof report?.timezone === 'string' && report.timezone.trim())
        return report.timezone.trim();
    const sample = report?.hourly?.[0]?.time || '';
    if (typeof sample === 'string' && (sample.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(sample)))
        return 'UTC';
    return undefined;
}

function nextHourKey(key) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(key || '');
    if (!match)
        return null;
    const date = new Date(Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4])));
    date.setUTCHours(date.getUTCHours() + 1);
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    return `${date.getUTCFullYear()}-${month}-${day}T${hour}`;
}

function hourAt(hourly, key) {
    if (!key || !Array.isArray(hourly))
        return null;
    return hourly.find(item => hourKey(item?.time) === key) || null;
}

export function isRainHour(hour) {
    if (!hour)
        return false;
    if (RAIN_CODES.has(hour.weatherCode))
        return true;
    return typeof hour.precipitationProbability === 'number'
        && hour.precipitationProbability >= RAIN_PROBABILITY;
}

export function isCycloneHour(hour) {
    return typeof hour?.windKmh === 'number' && hour.windKmh >= CYCLONE_WIND_KMH;
}

function describe(hour) {
    return {
        time: hour.time,
        label: hourLabel(hour.time),
        probability: typeof hour.precipitationProbability === 'number'
            ? hour.precipitationProbability
            : null,
        windKmh: typeof hour.windKmh === 'number' ? hour.windKmh : null,
    };
}

export function alertsAhead(report, now, leadHours = 1) {
    const empty = {rain: null, cyclone: null};
    const hourly = report?.hourly;
    const lead = clampAlertHours(leadHours);
    let key = forecastHourKey(now, zoneOf(report));
    if (!key)
        return empty;
    let rainBlocked = isRainHour(hourAt(hourly, key));
    let cycloneBlocked = isCycloneHour(hourAt(hourly, key));
    let rain = null;
    let cyclone = null;
    for (let step = 1; step <= lead; step += 1) {
        key = nextHourKey(key);
        const hour = hourAt(hourly, key);
        if (!key || !hour)
            break;
        if (!rainBlocked && isRainHour(hour))
            rain = describe(hour);
        if (isRainHour(hour))
            rainBlocked = true;
        if (!cycloneBlocked && isCycloneHour(hour))
            cyclone = describe(hour);
        if (isCycloneHour(hour))
            cycloneBlocked = true;
        if (rainBlocked && cycloneBlocked)
            break;
    }
    return {rain, cyclone};
}

export function alertsOneHourAhead(report, now) {
    return alertsAhead(report, now, 1);
}
