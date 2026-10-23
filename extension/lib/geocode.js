import {languageCode} from './settings.js';

export function reverseGeocodeUrl(latitude, longitude, locale) {
    return 'https://nominatim.openstreetmap.org/reverse?' + [
        `lat=${encodeURIComponent(latitude)}`,
        `lon=${encodeURIComponent(longitude)}`,
        'format=jsonv2',
        'zoom=12',
        `accept-language=${encodeURIComponent(languageCode(locale))}`,
    ].join('&');
}

function placeName(address) {
    for (const key of ['city', 'town', 'village', 'municipality', 'hamlet']) {
        const value = address[key];
        if (typeof value === 'string' && value.trim())
            return value.trim();
    }
    return '';
}

export function parseReverseGeocode(payload) {
    const address = payload?.address;
    if (!address || typeof address !== 'object')
        return null;
    const name = placeName(address);
    if (!name)
        return null;
    const latitude = Number(payload.lat);
    const longitude = Number(payload.lon);
    return {
        name,
        country: typeof address.country === 'string' ? address.country : '',
        admin: typeof address.state === 'string' ? address.state : '',
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
        timezone: '',
    };
}
