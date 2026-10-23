import {
    DEFAULT_ALERT_HOURS,
    DEFAULT_ALERT_MINUTES,
    DEFAULT_ALERT_RAIN_PERCENT,
    DEFAULT_ALERT_WIND_KMH,
    DEFAULT_REFRESH_MINUTES,
    MAX_ALERT_HOURS,
    MAX_ALERT_MINUTES,
    MAX_ALERT_RAIN_PERCENT,
    MAX_ALERT_WIND_KMH,
    MAX_REFRESH_MINUTES,
    MIN_ALERT_HOURS,
    MIN_ALERT_MINUTES,
    MIN_ALERT_RAIN_PERCENT,
    MIN_ALERT_WIND_KMH,
    MIN_REFRESH_MINUTES,
} from './constants.js';

const TEMPERATURE_UNITS = new Set(['celsius', 'fahrenheit']);
const WIND_UNITS = new Set(['kmh', 'ms', 'mph', 'kn']);
const PRESSURE_UNITS = new Set(['hpa', 'inhg']);
const BAR_FORMATS = new Set(['icon-temp', 'temp', 'icon', 'icon-temp-city']);
const MAX_SAVED_CITIES = 6;

export function clampRefreshMinutes(value) {
    const number = Number(value);
    if (!Number.isFinite(number))
        return DEFAULT_REFRESH_MINUTES;
    return Math.min(MAX_REFRESH_MINUTES, Math.max(MIN_REFRESH_MINUTES, Math.round(number)));
}

export function clampAlertHours(value) {
    const number = Number(value);
    if (!Number.isFinite(number))
        return DEFAULT_ALERT_HOURS;
    return Math.min(MAX_ALERT_HOURS, Math.max(MIN_ALERT_HOURS, Math.round(number)));
}

export function clampAlertMinutes(value) {
    const number = Number(value);
    if (!Number.isFinite(number))
        return DEFAULT_ALERT_MINUTES;
    return Math.min(MAX_ALERT_MINUTES, Math.max(MIN_ALERT_MINUTES, Math.round(number)));
}

export function clampAlertRainPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number))
        return DEFAULT_ALERT_RAIN_PERCENT;
    return Math.min(MAX_ALERT_RAIN_PERCENT, Math.max(MIN_ALERT_RAIN_PERCENT, Math.round(number)));
}

export function clampAlertWindKmh(value) {
    const number = Number(value);
    if (!Number.isFinite(number))
        return DEFAULT_ALERT_WIND_KMH;
    return Math.min(MAX_ALERT_WIND_KMH, Math.max(MIN_ALERT_WIND_KMH, Math.round(number)));
}

export function roundCoordinate(value, source) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return null;
    const digits = source === 'auto' ? 2 : 4;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function coordinatePair(latitude, longitude, source) {
    const lat = roundCoordinate(latitude, source);
    const lon = roundCoordinate(longitude, source);
    if (lat == null || lon == null)
        return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180)
        return null;
    return {latitude: lat, longitude: lon};
}

function manualLocation(state) {
    if (!state?.manualReady)
        return null;
    const coords = coordinatePair(state.latitude, state.longitude, 'manual');
    if (!coords)
        return null;
    const name = typeof state.cityName === 'string' ? state.cityName.trim() : '';
    if (!name)
        return null;
    return {
        source: 'manual',
        name,
        country: typeof state.countryName === 'string' ? state.countryName.trim() : '',
        admin: typeof state.adminName === 'string' ? state.adminName.trim() : '',
        timezone: typeof state.timezone === 'string' ? state.timezone : '',
        ...coords,
    };
}

export function locationFromState(state) {
    if (state?.useAutoLocation && state?.autoReady) {
        const coords = coordinatePair(state.autoLatitude, state.autoLongitude, 'auto');
        if (coords) {
            const name = typeof state.autoCityName === 'string' ? state.autoCityName.trim() : '';
            return {
                source: 'auto',
                name,
                country: typeof state.autoCountryName === 'string' ? state.autoCountryName.trim() : '',
                admin: typeof state.autoAdminName === 'string' ? state.autoAdminName.trim() : '',
                timezone: '',
                ...coords,
            };
        }
    }
    return manualLocation(state);
}

function cityRecord(row) {
    if (!row || typeof row !== 'object')
        return null;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name)
        return null;
    const coords = coordinatePair(Number(row.latitude), Number(row.longitude), 'manual');
    if (!coords)
        return null;
    return {
        name,
        country: typeof row.country === 'string' ? row.country.trim() : '',
        admin: typeof row.admin === 'string' ? row.admin.trim() : '',
        timezone: typeof row.timezone === 'string' ? row.timezone : '',
        ...coords,
    };
}

export function parseSavedCities(value) {
    let rows;
    try {
        rows = JSON.parse(typeof value === 'string' ? value : '[]');
    } catch {
        return [];
    }
    if (!Array.isArray(rows))
        return [];
    const cities = [];
    for (const row of rows) {
        const city = cityRecord(row);
        if (city)
            cities.push(city);
        if (cities.length >= MAX_SAVED_CITIES)
            break;
    }
    return cities;
}

export function rememberCity(list, city) {
    const record = cityRecord(city);
    if (!record)
        return Array.isArray(list) ? list.slice(0, MAX_SAVED_CITIES) : [];
    const key = placeKey({...record, source: 'manual'});
    const rest = (Array.isArray(list) ? list : []).filter(item => {
        return placeKey({...item, source: 'manual'}) !== key;
    });
    return [record, ...rest].slice(0, MAX_SAVED_CITIES);
}

export function forgetCity(list, city) {
    const record = cityRecord(city);
    const current = Array.isArray(list) ? list.slice(0, MAX_SAVED_CITIES) : [];
    if (!record)
        return current;
    const key = placeKey({...record, source: 'manual'});
    return current.filter(item => placeKey({...item, source: 'manual'}) !== key);
}

export function savedCitiesFromState(state) {
    const stored = parseSavedCities(state?.savedCities);
    const manual = manualLocation(state);
    if (!manual)
        return stored;
    return rememberCity(stored, manual);
}

export function placeKey(location) {
    const digits = location.source === 'auto' ? 2 : 4;
    return `${location.latitude.toFixed(digits)},${location.longitude.toFixed(digits)}`;
}

export function displayOptions(state) {
    const temperatureUnit = TEMPERATURE_UNITS.has(state?.temperatureUnit)
        ? state.temperatureUnit
        : 'celsius';
    const windSpeedUnit = WIND_UNITS.has(state?.windSpeedUnit)
        ? state.windSpeedUnit
        : 'kmh';
    const pressureUnit = PRESSURE_UNITS.has(state?.pressureUnit) ? state.pressureUnit : 'hpa';
    const barFormat = BAR_FORMATS.has(state?.barFormat) ? state.barFormat : 'icon-temp';
    return {
        temperatureUnit,
        windSpeedUnit,
        pressureUnit,
        showIcon: state?.showIcon !== false,
        showTemperature: state?.showTemperature !== false,
        barFormat,
        clockSide: state?.clockSide === 'before' ? 'before' : 'after',
        refreshMinutes: clampRefreshMinutes(state?.refreshMinutes),
    };
}

export function languageCode(locale) {
    const match = /^([a-zA-Z]{2})/.exec(locale || '');
    return match ? match[1].toLowerCase() : 'en';
}
