/**
 * Idempotent backfill/normalization of booking technician ownership.
 *
 *   npm run migrate:booking-technician                 # dry-run (no writes)
 *   npm run migrate:booking-technician -- --apply       # write changes
 *
 * Every booking is matched to its service document. The stored
 * `technicianEmail` and `technicianName` are replaced with the values from
 * that service, with the email normalized to lowercase so creation, listing
 * and status updates all compare the same value. Rows already in sync are
 * skipped, so the command is safe to re-run.
 */
import { ObjectId } from 'mongodb';
import { closeDB, COLLECTIONS, connectDB, getDb } from '../config/db.js';

const APPLY = process.argv.includes('--apply');

function normalizeEmail(value) {
    return String(value ?? '').trim().toLowerCase();
}

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
    const cursor = bookings.find(
        {},
        { projection: { serviceId: 1, technicianEmail: 1, technicianName: 1 } },
    );

    const summary = {
        mode: APPLY ? 'apply' : 'dry-run',
        bookingsScanned: 0,
        bookingsToChange: 0,
        bookingsUpdated: 0,
        missingOrInvalidServiceRef: 0,
        serviceWithoutTechnicianEmail: 0,
    };

    while (await cursor.hasNext()) {
        const booking = await cursor.next();
        summary.bookingsScanned += 1;

        const serviceId = serviceObjectId(booking.serviceId);
        if (!serviceId) {
            summary.missingOrInvalidServiceRef += 1;
            continue;
        }
        const service = await services.findOne(
            { _id: serviceId },
            { projection: { technicianEmail: 1, technicianName: 1 } },
        );
        if (!service) {
            summary.missingOrInvalidServiceRef += 1;
            continue;
        }

        const technicianEmail = normalizeEmail(service.technicianEmail);
        if (!technicianEmail) {
            summary.serviceWithoutTechnicianEmail += 1;
            continue;
        }
        const technicianName = service.technicianName ?? '';
        const update = {};
        if (booking.technicianEmail !== technicianEmail)
            update.technicianEmail = technicianEmail;
        if ((booking.technicianName ?? '') !== technicianName)
            update.technicianName = technicianName;
        if (Object.keys(update).length === 0)
            continue;

        summary.bookingsToChange += 1;
        if (!APPLY)
            continue;

        const result = await bookings.updateOne(
            {
                _id: booking._id,
                $or: [
                    { technicianEmail: { $ne: technicianEmail } },
                    { technicianName: { $ne: technicianName } },
                ],
            },
            { $set: update },
        );
        if (result.matchedCount)
            summary.bookingsUpdated += 1;
    }

    // Counts only: never log emails, tokens or other personal data.
    console.info('[fixmate:migrate:booking-technician]', JSON.stringify(summary, null, 2));
}

migrate()
    .catch((error) => {
        console.error('[fixmate:migrate:booking-technician] failed:', error?.message ?? 'Unknown error');
        process.exitCode = 1;
    })
    .finally(async () => {
        await closeDB();
    });
