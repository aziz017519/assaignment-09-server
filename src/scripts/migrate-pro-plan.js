import { closeDB, COLLECTIONS, connectDB, getDb } from '../config/db.js';

/**
 * Backfill for the Pro Technician Plan and unified payment success flow:
 * - every existing account gets plan = 'free' when it has no plan yet
 * - every existing payment gets type = 'booking' when it has no type yet
 * - legacy payment rows gain status/createdAt/currency alongside paymentStatus/paidAt
 * - connectDB() also reconciles payment indexes (partial unique indexes for
 *   bookingId / stripeSessionId / stripeInvoiceId) before any new rows exist.
 */
async function migrate() {
    await connectDB();
    const db = await getDb();
    const totals = { users: 0, authUsers: 0, payments: 0, paymentFields: 0 };
    for (const name of [COLLECTIONS.users, COLLECTIONS.user]) {
        const result = await db.collection(name).updateMany(
            { $or: [{ plan: { $exists: false } }, { plan: null }] },
            { $set: { plan: 'free' } }
        );
        totals[name === COLLECTIONS.users ? 'users' : 'authUsers'] = result.modifiedCount;
    }
    const paymentsCollection = db.collection(COLLECTIONS.payments);
    const typed = await paymentsCollection.updateMany(
        { $or: [{ type: { $exists: false } }, { type: null }] },
        { $set: { type: 'booking' } }
    );
    totals.payments = typed.modifiedCount;
    const fields = await paymentsCollection.updateMany(
        {
            $or: [
                { status: { $exists: false } },
                { status: null },
                { createdAt: { $exists: false } },
                { createdAt: null },
                { currency: { $exists: false } },
                { currency: null },
            ],
        },
        [{
            $set: {
                status: { $ifNull: ['$status', { $ifNull: ['$paymentStatus', 'paid'] }] },
                createdAt: { $ifNull: ['$createdAt', { $ifNull: ['$paidAt', '$$NOW'] }] },
                currency: { $ifNull: ['$currency', 'usd'] },
            },
        }]
    );
    totals.paymentFields = fields.modifiedCount;
    console.info('[fixmate: migrate-pro-plan]', totals);
}
migrate()
    .catch((error) => {
        console.error('[fixmate: migrate-pro-plan] failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await closeDB();
    });
