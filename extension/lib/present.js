import {condition} from './wmo.js';
import {
    formatMillimetres,
    formatPercent,
    formatPressure,
    formatTemperature,
    formatWind,
    windArrow,
} from './units.js';
import {hourLabel, weekdayIndex} from './time.js';

const RAIN_LIKELY_PERCENT = 40;

export function likelyRain(hourly) {
    if (!Array.isArray(hourly))
        return null;
    return hourly.find(item => {
        return typeof item?.precipitationProbability === 'number'
            && item.precipitationProbability >= RAIN_LIKELY_PERCENT;
    }) || null;
}

function details(report, settings) {
    const unit = settings.temperatureUnit;
    const windUnit = settings.windSpeedUnit;
    const sky = condition(report.weatherCode, report.isDay);
    return {
        temperature: formatTemperature(report.temperatureC, unit),
        apparent: formatTemperature(report.apparentC, unit),
        humidity: formatPercent(report.humidity),
        cloudCover: formatPercent(report.cloudCover),
        pressure: formatPressure(report.pressureHpa, settings.pressureUnit),
        wind: formatWind(report.windKmh, windUnit),
        windArrow: windArrow(report.windDirectionDeg),
        precipitation: formatMillimetres(report.precipitationMm),
        precipitationProbability: formatPercent(report.precipitationProbability),
        conditionName: sky.name,
        iconName: sky.iconName,
        observedAt: report.observedAt,
        hourly: report.hourly.map(item => {
            const itemSky = condition(item.weatherCode, item.isDay ?? report.isDay);
            return {
                label: hourLabel(item.time),
                temperature: formatTemperature(item.temperatureC, unit),
                iconName: itemSky.iconName,
                conditionName: itemSky.name,
                precipitationProbability: formatPercent(item.precipitationProbability),
            };
        }),
        daily: report.daily.map(item => {
            const itemSky = condition(item.weatherCode, true);
            return {
                date: item.date,
                weekdayIndex: weekdayIndex(item.date),
                minimum: formatTemperature(item.minC, unit, 1),
                maximum: formatTemperature(item.maxC, unit, 1),
                sunrise: item.sunrise,
                sunset: item.sunset,
                iconName: itemSky.iconName,
                conditionName: itemSky.name,
                precipitationProbability: formatPercent(item.precipitationProbability),
            };
        }),
        upcomingRain: (() => {
            const rain = likelyRain(report.hourly);
            if (!rain)
                return null;
            return {
                label: hourLabel(rain.time),
                probability: formatPercent(rain.precipitationProbability),
            };
        })(),
    };
}

export const STATUS_MESSAGES = [
    'Configure a city to see the weather.',
    'Loading weather…',
    'The weather service asked to slow down. Showing the last saved update.',
    'The weather service returned data that could not be read. Showing the last saved update.',
    'Showing the last saved update.',
    'The weather service asked to slow down.',
    'The weather service returned data that could not be read.',
    'Automatic location is unavailable.',
    'Weather unavailable',
];

export function statusMessage(status, errorCode) {
    if (status === 'unconfigured')
        return 'Configure a city to see the weather.';
    if (status === 'loading')
        return 'Loading weather…';
    if (status === 'stale') {
        if (errorCode === 'rate-limit')
            return 'The weather service asked to slow down. Showing the last saved update.';
        if (errorCode === 'invalid')
            return 'The weather service returned data that could not be read. Showing the last saved update.';
        return 'Showing the last saved update.';
    }
    if (status === 'unavailable') {
        if (errorCode === 'rate-limit')
            return 'The weather service asked to slow down.';
        if (errorCode === 'invalid')
            return 'The weather service returned data that could not be read.';
        if (errorCode === 'denied')
            return 'Automatic location is unavailable.';
        return 'Weather unavailable';
    }
    return null;
}

export function present({
    status,
    errorCode = null,
    location = null,
    report = null,
    settings,
    savedCities = [],
    providerId = 'open-meteo',
}) {
    const hasReport = (status === 'live' || status === 'stale') && report;
    const model = hasReport ? details(report, settings) : null;
    const showIcon = Boolean(settings.showIcon) && settings.barFormat !== 'temp';
    const showTemperature = Boolean(settings.showTemperature) && settings.barFormat !== 'icon';
    const showCity = settings.barFormat === 'icon-temp-city' && hasReport && Boolean(location?.name);

    let iconName = null;
    let barTemperature = null;
    if (model) {
        iconName = showIcon ? model.iconName : null;
        barTemperature = showTemperature ? model.temperature : null;
    } else if (status === 'loading') {
        iconName = showIcon ? 'view-refresh-symbolic' : null;
    } else if (status === 'unconfigured') {
        iconName = showIcon ? 'find-location-symbolic' : null;
    } else {
        iconName = showIcon ? 'network-offline-symbolic' : null;
    }

    if (!iconName && !barTemperature)
        iconName = 'open-menu-symbolic';

    return {
        status,
        errorCode,
        stale: status === 'stale',
        message: statusMessage(status, errorCode),
        iconName,
        barTemperature,
        barCity: showCity ? (location.name || '') : '',
        location,
        model,
        savedCities,
        providerId,
        placeCredit: Boolean(location?.source === 'auto' && location?.name),
    };
}
