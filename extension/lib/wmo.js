// WMO weather interpretation codes used by Open-Meteo.
// https://open-meteo.com/en/docs
const CONDITIONS = {
    0: ['Clear', 'weather-clear-symbolic', 'weather-clear-night-symbolic'],
    1: ['Mainly clear', 'weather-few-clouds-symbolic', 'weather-few-clouds-night-symbolic'],
    2: ['Partly cloudy', 'weather-few-clouds-symbolic', 'weather-few-clouds-night-symbolic'],
    3: ['Overcast', 'weather-overcast-symbolic', null],
    45: ['Fog', 'weather-fog-symbolic', null],
    48: ['Depositing rime fog', 'weather-fog-symbolic', null],
    51: ['Light drizzle', 'weather-showers-scattered-symbolic', null],
    53: ['Drizzle', 'weather-showers-symbolic', null],
    55: ['Heavy drizzle', 'weather-showers-symbolic', null],
    56: ['Freezing drizzle', 'weather-showers-symbolic', null],
    57: ['Heavy freezing drizzle', 'weather-showers-symbolic', null],
    61: ['Light rain', 'weather-showers-scattered-symbolic', null],
    63: ['Rain', 'weather-showers-symbolic', null],
    65: ['Heavy rain', 'weather-showers-symbolic', null],
    66: ['Freezing rain', 'weather-showers-symbolic', null],
    67: ['Heavy freezing rain', 'weather-showers-symbolic', null],
    71: ['Light snow', 'weather-snow-symbolic', null],
    73: ['Snow', 'weather-snow-symbolic', null],
    75: ['Heavy snow', 'weather-snow-symbolic', null],
    77: ['Snow grains', 'weather-snow-symbolic', null],
    80: ['Light showers', 'weather-showers-scattered-symbolic', null],
    81: ['Showers', 'weather-showers-symbolic', null],
    82: ['Heavy showers', 'weather-showers-symbolic', null],
    85: ['Light snow showers', 'weather-snow-symbolic', null],
    86: ['Snow showers', 'weather-snow-symbolic', null],
    95: ['Thunderstorm', 'weather-storm-symbolic', null],
    96: ['Thunderstorm with hail', 'weather-storm-symbolic', null],
    99: ['Thunderstorm with heavy hail', 'weather-storm-symbolic', null],
};

export const CONDITION_NAMES = [
    ...Object.values(CONDITIONS).map(row => row[0]),
    'Unknown conditions',
];

export function condition(code, isDay) {
    const row = CONDITIONS[code];
    if (!row) {
        return {
            name: 'Unknown conditions',
            iconName: 'dialog-information-symbolic',
            known: false,
        };
    }
    const [name, dayIcon, nightIcon] = row;
    return {
        name,
        iconName: isDay === false && nightIcon ? nightIcon : dayIcon,
        known: true,
    };
}
