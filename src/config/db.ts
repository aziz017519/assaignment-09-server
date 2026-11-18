import { MongoClient, type Collection, type Db } from 'mongodb';
import { env } from './env';
import type { BookingDoc, PaymentDoc, ServiceDoc, SessionDoc, UserDoc } from '../types/models';

declare global {
  // eslint-disable-next-line no-var
  var __fixmateClientPromise: Promise<MongoClient> | undefined;
}

export const COLLECTIONS = {
  users: 'users',
  services: 'services',
  bookings: 'bookings',
  payments: 'payments',
  sessions: 'session',
} as const;

function getClientPromise(): Promise<MongoClient> {
  if (!globalThis.__fixmateClientPromise) {
    const client = new MongoClient(env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10_000,
    });
    globalThis.__fixmateClientPromise = client.connect();
  }
  return globalThis.__fixmateClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(env.DB_NAME);
}

export async function getCollection<T extends Record<string, unknown>>(
  name: string,
): Promise<Collection<T>> {
  const db = await getDb();
  return db.collection<T>(name);
}

export const usersCollection = () => getCollection<UserDoc>(COLLECTIONS.users);
export const servicesCollection = () => getCollection<ServiceDoc>(COLLECTIONS.services);
export const bookingsCollection = () => getCollection<BookingDoc>(COLLECTIONS.bookings);
export const paymentsCollection = () => getCollection<PaymentDoc>(COLLECTIONS.payments);
export const sessionsCollection = () => getCollection<SessionDoc>(COLLECTIONS.sessions);

export async function createIndexes(): Promise<void> {
  const db = await getDb();

  await Promise.all([
    db.collection(COLLECTIONS.users).createIndex({ email: 1 }, { unique: true }),
    db.collection(COLLECTIONS.payments).createIndex({ stripeSessionId: 1 }, { unique: true }),
    db.collection(COLLECTIONS.payments).createIndex({ bookingId: 1 }, { unique: true }),
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
    db.collection(COLLECTIONS.sessions).createIndex({ token: 1 }, { unique: true }),
  ]);
}

let indexesReady: Promise<void> | undefined;

export async function connectDB(): Promise<void> {
  if (!indexesReady) {
    indexesReady = getDb()
      .then(() => createIndexes())
      .catch((error: unknown) => {
        indexesReady = undefined;
        throw error;
      });
  }
  await indexesReady;
}

export async function closeDB(): Promise<void> {
  if (globalThis.__fixmateClientPromise) {
    const client = await globalThis.__fixmateClientPromise;
    await client.close();
    globalThis.__fixmateClientPromise = undefined;
    indexesReady = undefined;
  }
}
