import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

import {deserializeCache} from '../extension/lib/cache.js';
import {APP_VERSION, EXTENSION_UUID} from '../extension/lib/constants.js';
import {parseForecast, parseGeocoding} from '../extension/lib/parse.js';
import {insertionIndex} from '../extension/lib/placement.js';
import {present, statusMessage} from '../extension/lib/present.js';
import {forecastUrl, geocodingUrl, getProvider} from '../extension/lib/provider.js';
import {WeatherError, refreshWeather} from '../extension/lib/refresh.js';
import {
    clampRefreshMinutes,
    displayOptions,
    locationFromState,
    placeKey,
    roundCoordinate,
} from '../extension/lib/settings.js';
import {hourLabel, weekdayIndex} from '../extension/lib/time.js';
import {
    compass,
    formatPressure,
    formatTemperature,
    formatWind,
    windArrow,
    toUnitTemperature,
} from '../extension/lib/units.js';
import {condition} from '../extension/lib/wmo.js';

const forecast = JSON.parse(readFileSync(new URL('./fixtures/forecast.json', import.meta.url)));
const geocode = JSON.parse(readFileSync(new URL('./fixtures/geocode.json', import.meta.url)));
const metadata = JSON.parse(readFileSync(new URL('../extension/metadata.json', import.meta.url)));
const version = readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim();

const paris = {
    source: 'manual',
    name: 'Paris',
    country: 'France',
    latitude: 48.8566,
    longitude: 2.3522,
    timezone: 'Europe/Paris',
};
const lyon = {
    source: 'manual',
    name: 'Lyon',
    country: 'France',
    latitude: 45.7491,
    longitude: 4.8479,
    timezone: 'Europe/Paris',
};
const display = displayOptions({
    temperatureUnit: 'celsius',
    windSpeedUnit: 'kmh',
    showIcon: true,
    showTemperature: true,
    barFormat: 'icon-temp',
    refreshMinutes: 30,
});

test('package version stays consistent', () => {
    assert.equal(version, APP_VERSION);
    assert.equal(metadata['version-name'], APP_VERSION);
    assert.equal(metadata.uuid, EXTENSION_UUID);
    assert.deepEqual(metadata['shell-version'], ['50']);
});

test('parses a real Open-Meteo forecast without inventing fields', () => {
    const parsed = parseForecast(forecast);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.temperatureC, 15.6);
    assert.equal(parsed.report.apparentC, 13.6);
    assert.equal(parsed.report.humidity, 66);
    assert.equal(parsed.report.weatherCode, 3);
    assert.equal(parsed.report.windKmh, 12.5);
    assert.equal(parsed.report.hourly.length, 24);
    assert.equal(parsed.report.daily.length, 7);
    assert.equal(parsed.report.conditionName, 'Overcast');
    assert.equal(hourLabel(parsed.report.hourly[0].time), '16:00');
    assert.equal(weekdayIndex(parsed.report.daily[0].date), 4);
});

test('rejects invalid payloads instead of filling defaults', () => {
    for (const payload of [null, [], {}, {error: true, reason: 'nope'}, {current: {time: 'x'}}]) {
        const parsed = parseForecast(payload);
        assert.equal(parsed.ok, false);
        assert.equal(parsed.report, undefined);
    }
    const missingTemperature = structuredClone(forecast);
    missingTemperature.current.temperature_2m = null;
    assert.equal(parseForecast(missingTemperature).ok, false);
});

test('unknown city search returns no results', () => {
    assert.deepEqual(parseGeocoding({results: []}), []);
    assert.deepEqual(parseGeocoding({}), []);
    const cities = parseGeocoding(geocode);
    assert.equal(cities[0].name, 'Lyon');
    assert.equal(cities[0].country, 'France');
    assert.equal(cities.length, 2);
});

test('units convert from the canonical Open-Meteo values', () => {
    assert.equal(formatTemperature(0, 'celsius'), '0 °C');
    assert.equal(formatTemperature(15.6, 'celsius'), '16 °C');
    assert.equal(formatTemperature(21.24, 'celsius', 1), '21.2 °C');
    assert.equal(formatTemperature(27, 'celsius', 1), '27 °C');
    assert.equal(formatTemperature(0, 'fahrenheit'), '32 °F');
    assert.equal(toUnitTemperature(100, 'fahrenheit'), 212);
    assert.equal(formatTemperature(null, 'celsius'), null);
    assert.equal(formatWind(12.5, 'kmh'), '12.5 km/h');
    assert.equal(formatWind(16.6, 'kmh'), '16.6 km/h');
    assert.equal(formatWind(36, 'ms'), '10.0 m/s');
    assert.equal(formatWind(1.852, 'kn'), '1 kn');
    assert.equal(formatPressure(1013), '29.9 inHg');
    assert.equal(windArrow(270), '←');
    assert.equal(compass(0), 'N');
    assert.equal(compass(219), 'SW');
    assert.equal(compass(null), null);
});

test('weather codes map to symbolic icons', () => {
    assert.equal(condition(0, true).iconName, 'weather-clear-symbolic');
    assert.equal(condition(0, false).iconName, 'weather-clear-night-symbolic');
    assert.equal(condition(95, true).iconName, 'weather-storm-symbolic');
    assert.equal(condition(123, true).known, false);
    assert.equal(condition(123, true).iconName.endsWith('-symbolic'), true);
});

test('refresh interval and coordinates stay bounded', () => {
    assert.equal(clampRefreshMinutes(1), 10);
    assert.equal(clampRefreshMinutes(1000), 180);
    assert.equal(clampRefreshMinutes('nope'), 30);
    assert.equal(roundCoordinate(48.85661, 'auto'), 48.86);
    assert.equal(roundCoordinate(2.35222, 'manual'), 2.3522);
    assert.equal(roundCoordinate(Number.NaN, 'manual'), null);
});

test('manual and automatic locations do not fall back to a fake city', () => {
    assert.equal(locationFromState({manualReady: false, useAutoLocation: false}), null);
    assert.equal(locationFromState({
        manualReady: true,
        cityName: '   ',
        latitude: 48.85,
        longitude: 2.35,
    }), null);
    const manual = locationFromState({
        manualReady: true,
        cityName: 'Lyon',
        countryName: 'France',
        latitude: 45.74906,
        longitude: 4.84789,
        timezone: 'Europe/Paris',
    });
    assert.equal(manual.name, 'Lyon');
    assert.equal(placeKey(manual), '45.7491,4.8479');

    const automatic = locationFromState({
        useAutoLocation: true,
        autoReady: true,
        autoLatitude: 45.751,
        autoLongitude: 4.849,
        manualReady: true,
        cityName: 'Lyon',
        latitude: 45.74906,
        longitude: 4.84789,
    });
    assert.equal(automatic.source, 'auto');
    assert.equal(automatic.name, '');
    assert.equal(automatic.latitude, 45.75);
    assert.notEqual(placeKey(automatic), placeKey(manual));
});

test('changing city ignores the previous cache', async () => {
    const provider = getProvider('open-meteo');
    const parsed = parseForecast(forecast);
    const parisCache = {
        savedAtMs: 1_000,
        placeKey: placeKey(paris),
        providerId: provider.id,
        report: parsed.report,
    };
    const result = await refreshWeather({
        fetchJson: async () => {
            throw new WeatherError('network');
        },
        provider,
        location: lyon,
        cache: parisCache,
        nowMs: 2_000,
        intervalMinutes: 30,
    });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.report, null);
});

test('network and invalid responses keep the last report for the same city only', async () => {
    const provider = getProvider('open-meteo');
    const parsed = parseForecast(forecast);
    const cache = {
        savedAtMs: 0,
        placeKey: placeKey(paris),
        providerId: provider.id,
        report: parsed.report,
    };
    const stale = await refreshWeather({
        fetchJson: async () => {
            throw new WeatherError('rate-limit');
        },
        provider,
        location: paris,
        cache,
        nowMs: 60 * 60 * 1000,
        intervalMinutes: 30,
    });
    assert.equal(stale.status, 'stale');
    assert.equal(stale.report.temperatureC, 15.6);
    assert.equal(stale.errorCode, 'rate-limit');

    const invalid = await refreshWeather({
        fetchJson: async () => ({error: true}),
        provider,
        location: paris,
        cache,
        nowMs: 60 * 60 * 1000,
        intervalMinutes: 30,
    });
    assert.equal(invalid.status, 'stale');
    assert.equal(invalid.report, cache.report);

    const empty = await refreshWeather({
        fetchJson: async () => {
            throw new WeatherError('network');
        },
        provider,
        location: paris,
        cache: null,
        nowMs: 0,
        intervalMinutes: 30,
    });
    assert.equal(empty.status, 'unavailable');
    assert.equal(empty.report, null);
});

test('a fresh cache does not trigger another request', async () => {
    const provider = getProvider('open-meteo');
    const parsed = parseForecast(forecast);
    let calls = 0;
    const cache = {
        savedAtMs: 10_000,
        placeKey: placeKey(paris),
        providerId: provider.id,
        report: parsed.report,
    };
    const result = await refreshWeather({
        fetchJson: async () => {
            calls += 1;
            return forecast;
        },
        provider,
        location: paris,
        cache,
        nowMs: 20_000,
        intervalMinutes: 30,
    });
    assert.equal(calls, 0);
    assert.equal(result.status, 'live');
    assert.equal(result.fromCache, true);
});

test('a live response replaces the cache and never stores an error document', async () => {
    const provider = getProvider('open-meteo');
    const result = await refreshWeather({
        fetchJson: async () => forecast,
        provider,
        location: paris,
        cache: null,
        nowMs: 5_000,
        intervalMinutes: 30,
    });
    assert.equal(result.status, 'live');
    assert.equal(result.cache.report.temperatureC, 15.6);
    assert.equal(deserializeCache(JSON.stringify(result.cache))?.report.temperatureC, 15.6);
    assert.equal(deserializeCache('{"temperature": 20}'), null);
    assert.equal(deserializeCache('not-json'), null);
});

test('unconfigured, failed and loading states do not show a temperature', () => {
    for (const status of ['unconfigured', 'loading', 'unavailable']) {
        const view = present({status, report: null, settings: display});
        assert.equal(view.model, null);
        assert.equal(view.barTemperature, null);
        assert.equal(view.barTemperature === '0 °C', false);
    }
    const live = present({
        status: 'live',
        location: paris,
        report: parseForecast(forecast).report,
        settings: display,
    });
    assert.equal(live.barTemperature, '16 °C');
    assert.equal(live.model.apparent, '14 °C');
    assert.equal(live.model.temperature, '16 °C');
    assert.equal(live.iconName, 'weather-overcast-symbolic');
    assert.equal(statusMessage('unavailable', 'network'), 'Weather unavailable');
});

test('fahrenheit display converts cached celsius without a new observation', () => {
    const view = present({
        status: 'live',
        location: paris,
        report: parseForecast(forecast).report,
        settings: displayOptions({...display, temperatureUnit: 'fahrenheit', windSpeedUnit: 'mph'}),
    });
    assert.equal(view.barTemperature, '60 °F');
    assert.match(view.model.wind, /mph$/);
});

test('hiding the icon or the temperature removes only that part', () => {
    const report = parseForecast(forecast).report;
    const hidden = present({
        status: 'live',
        location: paris,
        report,
        settings: displayOptions({
            ...display,
            showIcon: false,
            showTemperature: false,
            barFormat: 'icon-temp',
        }),
    });
    assert.equal(hidden.barTemperature, null);
    assert.equal(hidden.iconName, 'open-menu-symbolic');
    assert.ok(hidden.model);

    const city = present({
        status: 'live',
        location: paris,
        report,
        settings: displayOptions({...display, barFormat: 'icon-temp-city'}),
    });
    assert.equal(city.barCity, 'Paris');
});

test('the indicator is inserted beside the clock and only once per index', () => {
    assert.equal(insertionIndex(0, 'before'), 0);
    assert.equal(insertionIndex(2, 'before'), 2);
    assert.equal(insertionIndex(2, 'after'), 3);
    assert.equal(insertionIndex(-1, 'before'), 0);
});

test('forecast URL is HTTPS, has no API key and uses the rounded coordinates', () => {
    const url = forecastUrl(paris);
    assert.match(url, /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/);
    assert.equal(url.toLowerCase().includes('apikey'), false);
    assert.equal(url.toLowerCase().includes('api_key'), false);
    assert.match(url, /latitude=48\.8566/);
    assert.match(url, /longitude=2\.3522/);
    assert.match(url, /cloud_cover/);
    assert.match(url, /surface_pressure/);
    assert.match(url, /sunrise/);
    const search = geocodingUrl('São Paulo', 'fr_FR.UTF-8');
    assert.match(search, /^https:\/\/geocoding-api\.open-meteo\.com\//);
    assert.match(search, /language=fr/);
    assert.match(search, /name=S%C3%A3o%20Paulo/);
    assert.equal(getProvider('missing'), null);
});
