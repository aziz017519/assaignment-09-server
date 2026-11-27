/**
 * Idempotent backfill for service rating aggregates.
 *
 *   npm run migrate:ratings
 *
 * Rebuilds ratingSum/ratingCount on every service from bookings that already
 * carry a rating. Services without reviewed bookings are reset to zero so the
 * command can safely be re-run. Ratings are never removed or modified.
 */
import { ObjectId } from 'mongodb';
import { closeDB, COLLECTIONS, connectDB, getDb } from '../config/db.js';

function serviceObjectId(value) {
    if (value instanceof ObjectId)
        return value;
    if (typeof value === 'string' && ObjectId.isValid(value))
        return new ObjectId(value);
    return null;
}

async function migrate() {
    await connectDB();
    const db = await getDb();
    const bookings = db.collection(COLLECTIONS.bookings);
    const services = db.collection(COLLECTIONS.services);

    const grouped = await bookings.aggregate([
        { $match: { rating: { $exists: true } } },
        {
            $group: {
                _id: '$serviceId',
                ratingSum: { $sum: '$rating' },
                ratingCount: { $sum: 1 },
            },
        },
    ]).toArray();

    const summaries = new Map();
    let invalidServiceRefs = 0;
    let reviewedBookings = 0;
    for (const row of grouped) {
        reviewedBookings += Number(row.ratingCount) || 0;
        const id = serviceObjectId(row._id);
        if (!id) {
            invalidServiceRefs += Number(row.ratingCount) || 0;
            continue;
        }
        summaries.set(id.toHexString(), {
            _id: id,
            ratingSum: Number(row.ratingSum) || 0,
            ratingCount: Number(row.ratingCount) || 0,
        });
    }

    const allServices = await services.find({}, { projection: { _id: 1 } }).toArray();
    let servicesUpdated = 0;
    for (const service of allServices) {
        const summary = summaries.get(String(service._id)) ?? { _id: service._id, ratingSum: 0, ratingCount: 0 };
        const result = await services.updateOne(
            {
                _id: service._id,
                $or: [
                    { ratingSum: { $exists: false } },
                    { ratingCount: { $exists: false } },
                    { ratingSum: { $ne: summary.ratingSum } },
                    { ratingCount: { $ne: summary.ratingCount } },
                ],
            },
            { $set: { ratingSum: summary.ratingSum, ratingCount: summary.ratingCount } },
        );
        if (result.matchedCount)
            servicesUpdated += 1;
    }

    console.info('[fixmate:migrate:ratings]', JSON.stringify({
        reviewedBookings,
        servicesChecked: allServices.length,
        servicesUpdated,
        invalidServiceRefs,
    }, null, 2));
}

migrate()
    .catch((error) => {
        console.error('[fixmate:migrate:ratings] failed:', error?.message ?? 'Unknown error');
        process.exitCode = 1;
    })
    .finally(async () => {
        await closeDB();
    });
