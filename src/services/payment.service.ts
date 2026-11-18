import { ObjectId } from 'mongodb';
import { bookingsCollection, paymentsCollection } from '../config/db';
import type { PaymentDoc } from '../types/models';
import { badRequest, notFound } from '../utils/errors';

export type PaymentSession = {
  id: string;
  amount_total: number | null;
  payment_status: string | null;
  payment_intent: string | { id: string } | null;
  metadata?: Record<string, string> | null;
  created?: number;
};

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

async function markBookingPaid(bookingId: ObjectId): Promise<void> {
  const bookings = await bookingsCollection();
  await bookings.updateOne(
    { _id: bookingId, paymentStatus: 'unpaid' },
    { $set: { paymentStatus: 'paid' } },
  );
}

/**
 * Idempotently records a paid Stripe session exactly once and marks its booking paid.
 * Shared by the verify endpoint and the Stripe webhook.
 */
export async function savePaymentOnce(session: PaymentSession): Promise<PaymentDoc> {
  if (session.payment_status !== 'paid') {
    throw badRequest('Stripe session is not paid');
  }

  const bookingIdValue = session.metadata?.bookingId;
  if (!bookingIdValue || !ObjectId.isValid(bookingIdValue)) {
    throw badRequest('Stripe session is missing a valid bookingId');
  }
  const bookingId = new ObjectId(bookingIdValue);

  const payments = await paymentsCollection();
  const existing = await payments.findOne({
    $or: [{ stripeSessionId: session.id }, { bookingId }],
  });
  if (existing) {
    await markBookingPaid(existing.bookingId);
    return existing;
  }

  const bookings = await bookingsCollection();
  const booking = await bookings.findOne({ _id: bookingId });
  if (!booking) throw notFound('Booking for this payment was not found');

  const transactionId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? session.id);

  const document: Omit<PaymentDoc, '_id'> = {
    bookingId,
    serviceTitle: booking.serviceTitle,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    technicianName: booking.technicianName,
    technicianEmail: booking.technicianEmail,
    amount: (session.amount_total ?? Math.round(booking.finalAmount * 100)) / 100,
    currency: 'usd',
    transactionId,
    stripeSessionId: session.id,
    paymentStatus: 'paid',
    paidAt: new Date(session.created ? session.created * 1000 : Date.now()),
  };

  let insertedId: ObjectId;
  try {
    const result = await payments.insertOne(document);
    insertedId = result.insertedId;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const saved = await payments.findOne({
        $or: [{ stripeSessionId: session.id }, { bookingId }],
      });
      if (saved) {
        await markBookingPaid(saved.bookingId);
        return saved;
      }
    }
    throw error;
  }

  await markBookingPaid(bookingId);
  return { ...document, _id: insertedId };
}
