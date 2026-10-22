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

export function weekdayIndex(isoDate) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate || '');
    if (!match)
        return null;
    const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (!Number.isFinite(time))
        return null;
    return new Date(time).getUTCDay();
}
