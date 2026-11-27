import { MongoClient } from 'mongodb';
import { env } from './env.js';
export const COLLECTIONS = {
    users: 'users',
    user: 'user', // BetterAuth users created by the Next.js client
    services: 'services',
    bookings: 'bookings',
    payments: 'payments',
    sessions: 'session',
    accounts: 'account',
};
function getClientPromise() {
    if (!globalThis.__fixmateClientPromise) {
        const client = new MongoClient(env.MONGODB_URI, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 10_000,
        });
        globalThis.__fixmateClientPromise = client.connect().catch((error) => {
            // Allow a later serverless invocation to retry with a fresh client.
            globalThis.__fixmateClientPromise = undefined;
            throw error;
        });
    }
    return globalThis.__fixmateClientPromise;
}
export async function getDb() {
    const client = await getClientPromise();
    return client.db(env.DB_NAME);
}
export async function getCollection(name) {
    const db = await getDb();
    return db.collection(name);
}
export const usersCollection = () => getCollection(COLLECTIONS.users);
export const authUsersCollection = () => getCollection(COLLECTIONS.user);
export const servicesCollection = () => getCollection(COLLECTIONS.services);
export const bookingsCollection = () => getCollection(COLLECTIONS.bookings);
export const paymentsCollection = () => getCollection(COLLECTIONS.payments);
export const sessionsCollection = () => getCollection(COLLECTIONS.sessions);
export const accountsCollection = () => getCollection(COLLECTIONS.accounts);
// Booking payments always have a bookingId/sessionId. Partial indexes keep the
// uniqueness guarantee without rejecting a document that omits those fields.
async function ensurePaymentIndexes(db) {
    const payments = db.collection(COLLECTIONS.payments);
    const existing = await payments.indexes();
    const partialIndexes = ['stripeSessionId_1', 'bookingId_1'];
    for (const name of partialIndexes) {
        const index = existing.find((item) => item.name === name);
        if (index && !index.partialFilterExpression) {
            await payments.dropIndex(name);
        }
    }
    await Promise.all([
        payments.createIndex(
            { stripeSessionId: 1 },
            { unique: true, partialFilterExpression: { stripeSessionId: { $exists: true } } },
        ),
        payments.createIndex(
            { bookingId: 1 },
            { unique: true, partialFilterExpression: { bookingId: { $exists: true } } },
        ),
    ]);
}
export async function createIndexes() {
    const db = await getDb();
    await ensurePaymentIndexes(db);
    await Promise.all([
        db.collection(COLLECTIONS.users).createIndex({ email: 1 }, { unique: true }),
        db
            .collection(COLLECTIONS.services)
            .createIndex({ approvalStatus: 1, isAvailable: 1, createdAt: -1 }),
        db.collection(COLLECTIONS.services).createIndex({ title: 1 }),
        db.collection(COLLECTIONS.services).createIndex({ category: 1 }),
        db.collection(COLLECTIONS.services).createIndex({ title: 'text', category: 'text' }),
        db.collection(COLLECTIONS.bookings).createIndex({ customerEmail: 1 }),
        db.collection(COLLECTIONS.bookings).createIndex({ technicianEmail: 1 }),
        db.collection(COLLECTIONS.bookings).createIndex({
            serviceId: 1,
            customerEmail: 1,
            status: 1,
        }),
        db.collection(COLLECTIONS.bookings).createIndex(
            { serviceId: 1, reviewedAt: -1 },
            { name: 'serviceId_1_reviewedAt_-1' },
        ),
        db.collection(COLLECTIONS.sessions).createIndex({ token: 1 }, { unique: true }),
        db
            .collection(COLLECTIONS.accounts)
            .createIndex({ providerId: 1, accountId: 1 }, { unique: true }),
    ]);
}
let indexesReady;
export async function connectDB() {
    if (!indexesReady) {
        indexesReady = getDb()
            .then(() => createIndexes())
            .catch((error) => {
            indexesReady = undefined;
            throw error;
        });
    }
    await indexesReady;
}
export async function closeDB() {
    if (globalThis.__fixmateClientPromise) {
        const client = await globalThis.__fixmateClientPromise;
        await client.close();
        globalThis.__fixmateClientPromise = undefined;
        indexesReady = undefined;
    }
}
