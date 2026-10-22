import {FORECAST_ENDPOINT, GEOCODING_ENDPOINT, PROVIDER_ID} from './constants.js';
import {parseForecast, parseGeocoding} from './parse.js';
import {languageCode} from './settings.js';

function query(params) {
    return Object.entries(params)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
}

export function forecastUrl(location) {
    return `${FORECAST_ENDPOINT}?${query({
        latitude: String(location.latitude),
        longitude: String(location.longitude),
        current: [
            'temperature_2m',
            'relative_humidity_2m',
            'apparent_temperature',
            'is_day',
            'weather_code',
            'wind_speed_10m',
            'wind_direction_10m',
            'precipitation',
            'cloud_cover',
            'surface_pressure',
        ].join(','),
        hourly: [
            'temperature_2m',
            'precipitation_probability',
            'weather_code',
            'wind_speed_10m',
            'is_day',
        ].join(','),
        daily: [
            'weather_code',
            'temperature_2m_max',
            'temperature_2m_min',
            'precipitation_probability_max',
            'sunrise',
            'sunset',
        ].join(','),
        timezone: 'auto',
        forecast_days: '7',
        forecast_hours: '24',
        wind_speed_unit: 'kmh',
        timeformat: 'iso8601',
    })}`;
}

export function geocodingUrl(name, locale) {
    return `${GEOCODING_ENDPOINT}?${query({
        name,
        count: '8',
        language: languageCode(locale),
        format: 'json',
    })}`;
}

export const openMeteoProvider = {
    id: PROVIDER_ID,
    label: 'Open-Meteo',
    forecastUrl,
    geocodingUrl,
    parseForecast,
    parseGeocoding,
};

const PROVIDERS = {
    [PROVIDER_ID]: openMeteoProvider,
};

export function getProvider(id) {
    return PROVIDERS[id] || null;
}

export function listProviders() {
    return Object.values(PROVIDERS).map(provider => ({
        id: provider.id,
        label: provider.label,
    }));
}
