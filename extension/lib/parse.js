import {condition} from './wmo.js';
import {hourKey} from './time.js';

function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function weatherCode(value) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 99;
}

function optionalUnitInterval(value, max) {
    if (value == null)
        return null;
    if (!finite(value) || value < 0 || value > max)
        return null;
    return value;
}

function optionalDegrees(value) {
    if (value == null)
        return null;
    if (!finite(value))
        return null;
    return value;
}

export function isValidReport(report) {
    if (!report || typeof report !== 'object')
        return false;
    if (!finite(report.temperatureC))
        return false;
    if (!weatherCode(report.weatherCode))
        return false;
    if (typeof report.observedAt !== 'string' || !report.observedAt)
        return false;
    if (!Array.isArray(report.hourly) || !Array.isArray(report.daily))
        return false;
    return true;
}

function hourlyEntry(time, temperature, code, probability, wind, isDay) {
    if (typeof time !== 'string' || !hourKey(time))
        return null;
    if (!finite(temperature) || !weatherCode(code))
        return null;
    return {
        time,
        temperatureC: temperature,
        weatherCode: code,
        precipitationProbability: optionalUnitInterval(probability, 100),
        windKmh: finite(wind) && wind >= 0 ? wind : null,
        isDay: isDay === 1 ? true : isDay === 0 ? false : null,
    };
}

function optionalTime(value) {
    if (typeof value !== 'string' || !/T\d{2}:\d{2}/.test(value))
        return null;
    return value;
}

function dailyEntry(date, code, min, max, probability, sunrise, sunset) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
        return null;
    if (!weatherCode(code) || !finite(min) || !finite(max))
        return null;
    return {
        date,
        weatherCode: code,
        minC: min,
        maxC: max,
        precipitationProbability: optionalUnitInterval(probability, 100),
        sunrise: optionalTime(sunrise),
        sunset: optionalTime(sunset),
    };
}

function column(series, name, index) {
    const values = series?.[name];
    if (!Array.isArray(values) || index >= values.length)
        return undefined;
    return values[index];
}

export function parseForecast(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        return {ok: false, error: 'invalid'};
    if (payload.error)
        return {ok: false, error: 'invalid'};

    const current = payload.current;
    if (!current || typeof current !== 'object')
        return {ok: false, error: 'invalid'};
    if (!finite(current.temperature_2m) || !weatherCode(current.weather_code))
        return {ok: false, error: 'invalid'};
    if (typeof current.time !== 'string' || !current.time)
        return {ok: false, error: 'invalid'};

    const hourly = [];
    const hourlySeries = payload.hourly;
    const hourlyCount = Array.isArray(hourlySeries?.time) ? hourlySeries.time.length : 0;
    for (let i = 0; i < hourlyCount; i++) {
        const entry = hourlyEntry(
            column(hourlySeries, 'time', i),
            column(hourlySeries, 'temperature_2m', i),
            column(hourlySeries, 'weather_code', i),
            column(hourlySeries, 'precipitation_probability', i),
            column(hourlySeries, 'wind_speed_10m', i),
            column(hourlySeries, 'is_day', i));
        if (entry)
            hourly.push(entry);
    }

    const currentHour = hourKey(current.time);
    let upcoming = hourly;
    if (currentHour) {
        const start = hourly.findIndex(item => hourKey(item.time) >= currentHour);
        if (start >= 0)
            upcoming = hourly.slice(start);
    }
    upcoming = upcoming.slice(0, 24);

    const sameHour = upcoming.find(item => hourKey(item.time) === currentHour) || null;

    const daily = [];
    const dailySeries = payload.daily;
    const dailyCount = Array.isArray(dailySeries?.time) ? dailySeries.time.length : 0;
    for (let i = 0; i < dailyCount && daily.length < 7; i++) {
        const entry = dailyEntry(
            column(dailySeries, 'time', i),
            column(dailySeries, 'weather_code', i),
            column(dailySeries, 'temperature_2m_min', i),
            column(dailySeries, 'temperature_2m_max', i),
            column(dailySeries, 'precipitation_probability_max', i),
            column(dailySeries, 'sunrise', i),
            column(dailySeries, 'sunset', i));
        if (entry)
            daily.push(entry);
    }

    const report = {
        observedAt: current.time,
        temperatureC: current.temperature_2m,
        apparentC: finite(current.apparent_temperature) ? current.apparent_temperature : null,
        humidity: optionalUnitInterval(current.relative_humidity_2m, 100),
        weatherCode: current.weather_code,
        isDay: current.is_day === 1 ? true : current.is_day === 0 ? false : null,
        windKmh: finite(current.wind_speed_10m) && current.wind_speed_10m >= 0
            ? current.wind_speed_10m
            : null,
        windDirectionDeg: optionalDegrees(current.wind_direction_10m),
        precipitationMm: finite(current.precipitation) && current.precipitation >= 0
            ? current.precipitation
            : null,
        precipitationProbability: sameHour ? sameHour.precipitationProbability : null,
        cloudCover: optionalUnitInterval(current.cloud_cover, 100),
        pressureHpa: finite(current.surface_pressure) && current.surface_pressure > 200 && current.surface_pressure < 1200
            ? current.surface_pressure
            : null,
        timezone: typeof payload.timezone === 'string' ? payload.timezone : null,
        hourly: upcoming,
        daily,
        conditionName: condition(current.weather_code, current.is_day === 0 ? false : current.is_day === 1 ? true : null).name,
    };

    if (!isValidReport(report))
        return {ok: false, error: 'invalid'};
    return {ok: true, report};
}

export function parseGeocoding(payload) {
    const rows = payload && Array.isArray(payload.results) ? payload.results : [];
    const cities = [];
    for (const row of rows) {
        if (!row || typeof row.name !== 'string' || !row.name.trim())
            continue;
        if (!finite(row.latitude) || !finite(row.longitude))
            continue;
        if (Math.abs(row.latitude) > 90 || Math.abs(row.longitude) > 180)
            continue;
        cities.push({
            name: row.name.trim(),
            country: typeof row.country === 'string' ? row.country : '',
            admin: typeof row.admin1 === 'string' ? row.admin1 : '',
            latitude: row.latitude,
            longitude: row.longitude,
            timezone: typeof row.timezone === 'string' ? row.timezone : '',
        });
    }
    return cities;
}
