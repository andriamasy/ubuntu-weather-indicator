export function insertionIndex(clockIndex, side) {
    const index = Number.isInteger(clockIndex) && clockIndex >= 0 ? clockIndex : 0;
    if (side === 'after')
        return index + 1;
    return index;
}

export function classifyClockBox(boxName) {
    if (boxName === 'left' || boxName === 'center' || boxName === 'right')
        return boxName;
    return 'center';
}
