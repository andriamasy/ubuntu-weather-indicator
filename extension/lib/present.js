import {condition} from './wmo.js';
import {
    formatMillimetres,
    formatPercent,
    formatPressure,
    formatTemperature,
    formatWind,
    windArrow,
} from './units.js';
import {forecastHourKey, hourKey, hourLabel, weekdayIndex} from './time.js';

const RAIN_LIKELY_PERCENT = 40;

export function likelyRain(hourly) {
    if (!Array.isArray(hourly))
        return null;
    return hourly.find(item => {
        return typeof item?.precipitationProbability === 'number'
            && item.precipitationProbability >= RAIN_LIKELY_PERCENT;
    }) || null;
}

function hourZone(report) {
    if (typeof report.timezone === 'string' && report.timezone.trim())
        return report.timezone.trim();
    const sample = report.observedAt || report.hourly?.[0]?.time || '';
    if (typeof sample === 'string' && (sample.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(sample)))
        return 'UTC';
    return undefined;
}

function hoursFromNow(report, now) {
    const hourly = Array.isArray(report.hourly) ? report.hourly : [];
    const key = forecastHourKey(now, hourZone(report));
    if (!key)
        return {hourly, slot: null};
    const start = hourly.findIndex(item => {
        const itemKey = hourKey(item.time);
        return itemKey && itemKey >= key;
    });
    if (start < 0)
        return {hourly, slot: null};
    const upcoming = hourly.slice(start);
    const slot = hourKey(upcoming[0]?.time) === key ? upcoming[0] : null;
    return {hourly: upcoming, slot};
}

function details(report, settings, now) {
    const unit = settings.temperatureUnit;
    const windUnit = settings.windSpeedUnit;
    const aligned = now ? hoursFromNow(report, now) : {hourly: report.hourly, slot: null};
    const slot = aligned.slot;
    const sky = condition(slot?.weatherCode ?? report.weatherCode, slot?.isDay ?? report.isDay);
    const hourly = aligned.hourly;
    return {
        temperature: formatTemperature(slot?.temperatureC ?? report.temperatureC, unit),
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
        observedAt: slot?.time || report.observedAt,
        hourly: hourly.map(item => {
            const itemSky = condition(item.weatherCode, item.isDay ?? report.isDay);
            return {
                time: item.time,
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
            const rain = likelyRain(hourly);
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
    now = null,
}) {
    const hasReport = (status === 'live' || status === 'stale') && report;
    const model = hasReport ? details(report, settings, now) : null;
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
        timeZone: hasReport && typeof report.timezone === 'string' ? report.timezone : null,
    };
}
