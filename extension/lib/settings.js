import {
    DEFAULT_REFRESH_MINUTES,
    MAX_REFRESH_MINUTES,
    MIN_REFRESH_MINUTES,
} from './constants.js';

const TEMPERATURE_UNITS = new Set(['celsius', 'fahrenheit']);
const WIND_UNITS = new Set(['kmh', 'ms', 'mph', 'kn']);
const BAR_FORMATS = new Set(['icon-temp', 'temp', 'icon', 'icon-temp-city']);

export function clampRefreshMinutes(value) {
    const number = Number(value);
    if (!Number.isFinite(number))
        return DEFAULT_REFRESH_MINUTES;
    return Math.min(MAX_REFRESH_MINUTES, Math.max(MIN_REFRESH_MINUTES, Math.round(number)));
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
            return {
                source: 'auto',
                name: '',
                country: '',
                admin: '',
                timezone: '',
                ...coords,
            };
        }
    }
    return manualLocation(state);
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
    const barFormat = BAR_FORMATS.has(state?.barFormat) ? state.barFormat : 'icon-temp';
    return {
        temperatureUnit,
        windSpeedUnit,
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
