export function hourKey(iso) {
    const match = /^(\d{4}-\d{2}-\d{2}T\d{2})/.exec(iso || '');
    return match ? match[1] : null;
}

export function hourLabel(iso) {
    const match = /T(\d{2}):(\d{2})/.exec(iso || '');
    if (!match)
        return null;
    return `${match[1]}:${match[2]}`;
}

export function forecastHourKey(date, timeZone) {
    const when = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(when.getTime()))
        return null;
    const options = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hour12: false,
    };
    if (typeof timeZone === 'string' && timeZone.trim())
        options.timeZone = timeZone.trim();
    let parts;
    try {
        parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(when);
    } catch {
        return null;
    }
    const value = type => parts.find(part => part.type === type)?.value;
    const year = value('year');
    const month = value('month');
    const day = value('day');
    let hour = value('hour');
    if (hour === '24')
        hour = '00';
    if (!year || !month || !day || !hour)
        return null;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}`;
}

function zoneOffsetMinutes(date, timeZone) {
    const options = {
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    };
    if (typeof timeZone === 'string' && timeZone.trim())
        options.timeZone = timeZone.trim();
    let parts;
    try {
        parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
    } catch {
        return null;
    }
    const value = type => Number(parts.find(part => part.type === type)?.value);
    let hour = value('hour');
    if (hour === 24)
        hour = 0;
    const year = value('year');
    const month = value('month');
    const day = value('day');
    const minute = value('minute');
    const second = value('second');
    if (![year, month, day, hour, minute, second].every(Number.isFinite))
        return null;
    const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    return Math.round((asUtc - date.getTime()) / 60000);
}

export function civilHourToDate(key, timeZone) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(key || '');
    if (!match)
        return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const utcGuess = Date.UTC(year, month - 1, day, hour, 0, 0);
    let utc = utcGuess;
    for (let pass = 0; pass < 3; pass += 1) {
        const offset = zoneOffsetMinutes(new Date(utc), timeZone);
        if (offset == null)
            return null;
        const next = utcGuess - offset * 60000;
        if (next === utc)
            break;
        utc = next;
    }
    return new Date(utc);
}

export function weekdayIndex(isoDate) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate || '');
    if (!match)
        return null;
    const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (!Number.isFinite(time))
        return null;
    return new Date(time).getUTCDay();
}
