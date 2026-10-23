const WIND_SUFFIX = {
    kmh: 'km/h',
    ms: 'm/s',
    mph: 'mph',
    kn: 'kn',
};

export function toUnitTemperature(celsius, unit) {
    if (typeof celsius !== 'number' || !Number.isFinite(celsius))
        return null;
    if (unit === 'fahrenheit')
        return (celsius * 9) / 5 + 32;
    return celsius;
}

function temperatureSuffix(unit) {
    return unit === 'fahrenheit' ? '°F' : '°C';
}

export function formatTemperature(celsius, unit, digits = 0) {
    const value = toUnitTemperature(celsius, unit);
    if (value == null)
        return null;
    const factor = 10 ** digits;
    const rounded = Math.round(value * factor) / factor;
    const shown = digits > 0 && !Number.isInteger(rounded)
        ? rounded.toFixed(digits)
        : String(rounded);
    return `${shown} ${temperatureSuffix(unit)}`;
}

export function toUnitWind(kmh, unit) {
    if (typeof kmh !== 'number' || !Number.isFinite(kmh))
        return null;
    switch (unit) {
    case 'ms':
        return kmh / 3.6;
    case 'mph':
        return kmh / 1.609344;
    case 'kn':
        return kmh / 1.852;
    default:
        return kmh;
    }
}

export function formatWind(kmh, unit) {
    const value = toUnitWind(kmh, unit);
    if (value == null)
        return null;
    const digits = unit === 'kn' ? 0 : 1;
    const suffix = WIND_SUFFIX[unit] || WIND_SUFFIX.kmh;
    return `${value.toFixed(digits)} ${suffix}`;
}

const WIND_ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

export function windArrow(degrees) {
    if (typeof degrees !== 'number' || !Number.isFinite(degrees))
        return null;
    const normalized = ((degrees % 360) + 360) % 360;
    return WIND_ARROWS[Math.round(normalized / 45) % 8];
}

export function formatPressure(hpa, unit = 'hpa') {
    if (typeof hpa !== 'number' || !Number.isFinite(hpa) || hpa <= 0)
        return null;
    if (unit === 'inhg')
        return `${(hpa * 0.029529983071445).toFixed(1)} inHg`;
    return `${Math.round(hpa)} hPa`;
}

const COMPASS = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

export function compass(degrees) {
    if (typeof degrees !== 'number' || !Number.isFinite(degrees))
        return null;
    const normalized = ((degrees % 360) + 360) % 360;
    return COMPASS[Math.round(normalized / 22.5) % 16];
}

export function formatPercent(value) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return null;
    return `${Math.round(value)} %`;
}

export function formatMillimetres(value) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return null;
    const rounded = Math.round(value * 10) / 10;
    return `${rounded} mm`;
}
