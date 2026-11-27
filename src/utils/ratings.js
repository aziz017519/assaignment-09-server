function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

export function ratingSummary(service) {
    const ratingCount = Math.max(0, Math.trunc(finiteNumber(service?.ratingCount)));
    const ratingSum = finiteNumber(service?.ratingSum);
    const averageRating = ratingCount > 0
        ? Math.round((ratingSum / ratingCount) * 10) / 10
        : 0;
    return { averageRating, ratingCount };
}

export function withRatingSummary(service) {
    if (!service)
        return service;
    // ratingSum is an internal aggregate field; clients only need the derived values.
    const { ratingSum, ...publicFields } = service;
    return { ...publicFields, ...ratingSummary(service) };
}

export function hasRating(booking) {
    return Boolean(
        booking &&
        typeof booking.rating === 'number' &&
        Number.isFinite(booking.rating),
    );
}

export function firstName(value) {
    const name = String(value ?? '').trim();
    if (!name)
        return 'Customer';
    const first = name.split(/\s+/)[0];
    // Never fall back to an email address if customerName is malformed.
    return first.includes('@') ? 'Customer' : first;
}
