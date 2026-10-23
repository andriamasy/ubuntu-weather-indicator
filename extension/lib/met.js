const SYMBOLS = {
    clearsky: 0,
    fair: 1,
    partlycloudy: 2,
    cloudy: 3,
    fog: 45,
    lightrainshowers: 80,
    rainshowers: 81,
    heavyrainshowers: 82,
    lightrainshowersandthunder: 95,
    rainshowersandthunder: 95,
    heavyrainshowersandthunder: 95,
    lightsleetshowers: 56,
    sleetshowers: 56,
    heavysleetshowers: 57,
    lightsnowshowers: 85,
    snowshowers: 86,
    heavysnowshowers: 86,
    lightsleetshowersandthunder: 95,
    sleetshowersandthunder: 95,
    heavysleetshowersandthunder: 95,
    lightsnowshowersandthunder: 95,
    snowshowersandthunder: 95,
    heavysnowshowersandthunder: 95,
    lightrain: 61,
    rain: 63,
    heavyrain: 65,
    lightrainandthunder: 95,
    rainandthunder: 95,
    heavyrainandthunder: 95,
    lightsleet: 56,
    sleet: 67,
    heavysleet: 67,
    lightsleetandthunder: 95,
    sleetandthunder: 95,
    heavysleetandthunder: 95,
    lightsnow: 71,
    snow: 73,
    heavysnow: 75,
    lightsnowandthunder: 95,
    snowandthunder: 95,
    heavysnowandthunder: 95,
};

function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

export function symbolCode(symbol) {
    const base = String(symbol || '').split('_')[0];
    return Object.prototype.hasOwnProperty.call(SYMBOLS, base) ? SYMBOLS[base] : null;
}

function symbolOf(data) {
    return data?.next_1_hours?.summary?.symbol_code
        || data?.next_6_hours?.summary?.symbol_code
        || data?.next_12_hours?.summary?.symbol_code
        || '';
}

function isDay(symbol) {
    if (String(symbol).endsWith('_night'))
        return false;
    if (String(symbol).endsWith('_day'))
        return true;
    return null;
}

function detailsOf(entry) {
    return entry?.data?.instant?.details || null;
}

export function metForecastUrl(location) {
    const latitude = Number(location.latitude).toFixed(4);
    const longitude = Number(location.longitude).toFixed(4);
    return `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${latitude}&lon=${longitude}`;
}

export function parseMetForecast(payload) {
    const series = payload?.properties?.timeseries;
    if (!Array.isArray(series) || series.length === 0)
        return {ok: false, error: 'invalid'};

    const current = series[0];
    const currentDetails = detailsOf(current);
    const currentSymbol = symbolOf(current.data);
    const currentCode = symbolCode(currentSymbol);
    if (!currentDetails || !finite(currentDetails.air_temperature) || currentCode == null)
        return {ok: false, error: 'invalid'};
    if (typeof current.time !== 'string' || !current.time)
        return {ok: false, error: 'invalid'};

    const hourly = [];
    for (const entry of series) {
        if (hourly.length >= 24)
            break;
        const details = detailsOf(entry);
        const symbol = symbolOf(entry.data);
        const code = symbolCode(symbol);
        if (!details || typeof entry.time !== 'string' || !finite(details.air_temperature) || code == null)
            continue;
        const probability = entry.data?.next_1_hours?.details?.probability_of_precipitation;
        const wind = details.wind_speed;
        hourly.push({
            time: entry.time,
            temperatureC: details.air_temperature,
            weatherCode: code,
            precipitationProbability: finite(probability) && probability >= 0 && probability <= 100
                ? probability
                : null,
            windKmh: finite(wind) && wind >= 0 ? wind * 3.6 : null,
            isDay: isDay(symbol),
        });
    }

    const byDay = new Map();
    for (const entry of series) {
        const details = detailsOf(entry);
        const code = symbolCode(symbolOf(entry.data));
        if (!details || typeof entry.time !== 'string' || !finite(details.air_temperature) || code == null)
            continue;
        const date = entry.time.slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
            continue;
        const day = byDay.get(date) || {date, minC: details.air_temperature, maxC: details.air_temperature, weatherCode: code};
        day.minC = Math.min(day.minC, details.air_temperature);
        day.maxC = Math.max(day.maxC, details.air_temperature);
        byDay.set(date, day);
    }
    const daily = [...byDay.values()].slice(0, 7).map(day => ({
        date: day.date,
        weatherCode: day.weatherCode,
        minC: day.minC,
        maxC: day.maxC,
        precipitationProbability: null,
        sunrise: null,
        sunset: null,
    }));

    const nextHour = current.data?.next_1_hours?.details || {};
    const pressure = currentDetails.air_pressure_at_sea_level;
    const report = {
        observedAt: current.time,
        temperatureC: currentDetails.air_temperature,
        apparentC: null,
        humidity: finite(currentDetails.relative_humidity)
            && currentDetails.relative_humidity >= 0
            && currentDetails.relative_humidity <= 100
            ? currentDetails.relative_humidity
            : null,
        weatherCode: currentCode,
        isDay: isDay(currentSymbol),
        windKmh: finite(currentDetails.wind_speed) && currentDetails.wind_speed >= 0
            ? currentDetails.wind_speed * 3.6
            : null,
        windDirectionDeg: finite(currentDetails.wind_from_direction)
            ? currentDetails.wind_from_direction
            : null,
        precipitationMm: finite(nextHour.precipitation_amount) && nextHour.precipitation_amount >= 0
            ? nextHour.precipitation_amount
            : null,
        precipitationProbability: finite(nextHour.probability_of_precipitation)
            && nextHour.probability_of_precipitation >= 0
            && nextHour.probability_of_precipitation <= 100
            ? nextHour.probability_of_precipitation
            : null,
        cloudCover: finite(currentDetails.cloud_area_fraction)
            && currentDetails.cloud_area_fraction >= 0
            && currentDetails.cloud_area_fraction <= 100
            ? currentDetails.cloud_area_fraction
            : null,
        pressureHpa: finite(pressure) && pressure > 200 && pressure < 1200 ? pressure : null,
        timezone: null,
        hourly,
        daily,
        conditionName: null,
    };
    return {ok: true, report};
}
