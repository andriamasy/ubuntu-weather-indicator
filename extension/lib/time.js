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

export function weekdayIndex(isoDate) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate || '');
    if (!match)
        return null;
    const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (!Number.isFinite(time))
        return null;
    return new Date(time).getUTCDay();
}
