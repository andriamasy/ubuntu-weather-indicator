import {clampAlertHours, clampAlertMinutes, clampAlertRainPercent, clampAlertWindKmh} from './settings.js';
import {civilHourToDate, forecastHourKey, hourKey, hourLabel} from './time.js';

const RAIN_CODES = new Set([
    51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99,
]);

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

export function isRainHour(hour, rainPercent) {
    if (!hour)
        return false;
    if (RAIN_CODES.has(hour.weatherCode))
        return true;
    const minimum = clampAlertRainPercent(rainPercent);
    return typeof hour.precipitationProbability === 'number'
        && hour.precipitationProbability >= minimum;
}

export function isCycloneHour(hour, windKmh) {
    const minimum = clampAlertWindKmh(windKmh);
    return typeof hour?.windKmh === 'number' && hour.windKmh >= minimum;
}

function alertOptions(value) {
    const options = value && typeof value === 'object' ? value : {leadHours: value};
    return {
        leadHours: options.leadHours,
        minutes: options.minutes,
        rainEnabled: options.rainEnabled !== false,
        cycloneEnabled: options.cycloneEnabled !== false,
        rainPercent: options.rainPercent,
        windKmh: options.windKmh,
    };
}

export function leadMinutes(options) {
    const parsed = alertOptions(options);
    const total = clampAlertHours(parsed.leadHours) * 60 + clampAlertMinutes(parsed.minutes);
    return total > 0 ? total : 1;
}

function describe(hour, minutesUntil) {
    return {
        time: hour.time,
        label: hourLabel(hour.time),
        probability: typeof hour.precipitationProbability === 'number'
            ? hour.precipitationProbability
            : null,
        windKmh: typeof hour.windKmh === 'number' ? hour.windKmh : null,
        minutesUntil,
    };
}

function minutesUntilHour(key, now, timeZone) {
    const onset = civilHourToDate(key, timeZone);
    if (!onset || !(now instanceof Date) || Number.isNaN(now.getTime()))
        return null;
    return (onset.getTime() - now.getTime()) / 60000;
}

function dueAlert(item, lead) {
    return item && item.minutesUntil > 0 && item.minutesUntil <= lead ? item : null;
}

function waitMinutes(item, lead) {
    if (!item || item.minutesUntil <= lead)
        return null;
    return item.minutesUntil - lead;
}

export function alertsAhead(report, now, leadHours = 1) {
    const empty = {rain: null, cyclone: null, waitMinutes: null};
    const options = alertOptions(leadHours);
    if (!options.rainEnabled && !options.cycloneEnabled)
        return empty;
    const hourly = report?.hourly;
    const lead = leadMinutes(options);
    const rainPercent = clampAlertRainPercent(options.rainPercent);
    const windMinimum = clampAlertWindKmh(options.windKmh);
    const zone = zoneOf(report);
    let key = forecastHourKey(now, zone);
    if (!key)
        return empty;
    const current = hourAt(hourly, key);
    let rainBlocked = options.rainEnabled && isRainHour(current, rainPercent);
    let cycloneBlocked = options.cycloneEnabled && isCycloneHour(current, windMinimum);
    let rain = null;
    let cyclone = null;
    for (let step = 1; step <= 36; step += 1) {
        key = nextHourKey(key);
        const hour = hourAt(hourly, key);
        if (!key || !hour)
            break;
        const until = minutesUntilHour(key, now, zone);
        if (until == null)
            break;
        const rainy = options.rainEnabled && isRainHour(hour, rainPercent);
        const cyclonic = options.cycloneEnabled && isCycloneHour(hour, windMinimum);
        if (until <= 0) {
            if (rainy)
                rainBlocked = true;
            if (cyclonic)
                cycloneBlocked = true;
        } else {
            if (!rainBlocked && rainy)
                rain = describe(hour, until);
            if (rainy)
                rainBlocked = true;
            if (!cycloneBlocked && cyclonic)
                cyclone = describe(hour, until);
            if (cyclonic)
                cycloneBlocked = true;
        }
        if ((!options.rainEnabled || rainBlocked) && (!options.cycloneEnabled || cycloneBlocked))
            break;
    }
    const waits = [waitMinutes(rain, lead), waitMinutes(cyclone, lead)].filter(value => value != null);
    return {
        rain: dueAlert(rain, lead),
        cyclone: dueAlert(cyclone, lead),
        waitMinutes: waits.length ? Math.min(...waits) : null,
    };
}

export function alertsOneHourAhead(report, now) {
    return alertsAhead(report, now, 1);
}
