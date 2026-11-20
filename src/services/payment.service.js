import { ObjectId } from 'mongodb';
import { bookingsCollection, paymentsCollection } from '../config/db.js';
import { getStripe } from '../config/stripe.js';
import { badRequest, notFound } from '../utils/errors.js';

function isDuplicateKeyError(error) {
    return (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000);
}
function idOf(value) {
    if (!value)
        return null;
    return typeof value === 'string' ? value : (value.id ?? null);
}
function objectFrom(value) {
    return value && typeof value === 'object' ? value : null;
}
function receiptUrlFromCharge(charge) {
    const url = objectFrom(charge)?.receipt_url;
    return typeof url === 'string' && url.startsWith('https://') ? url : null;
}
async function resolveReceiptUrl(session) {
    const latestCharge = objectFrom(objectFrom(session.payment_intent)?.latest_charge);
    const directUrl = receiptUrlFromCharge(latestCharge);
    if (directUrl)
        return directUrl;
    const paymentIntentId = idOf(session.payment_intent);
    if (!paymentIntentId)
        return null;
    try {
        const paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId, {
            expand: ['latest_charge'],
        });
        return receiptUrlFromCharge(paymentIntent.latest_charge);
    }
    catch {
        // A receipt is optional; never fail a paid webhook because Stripe
        // could not return the expanded charge.
        return null;
    }
}
async function markBookingPaid(bookingId) {
    if (!bookingId)
        return;
    const bookings = await bookingsCollection();
    await bookings.updateOne({ _id: bookingId, paymentStatus: 'unpaid' }, { $set: { paymentStatus: 'paid' } });
}
/**
 * Idempotently records a paid Stripe session exactly once and marks its booking paid.
 * Shared by the Stripe webhook only; the verify endpoint never writes state.
 */
export async function savePaymentOnce(session) {
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
    const transactionId = idOf(session.payment_intent) ?? session.id;
    const paidAt = new Date(session.created ? session.created * 1000 : Date.now());
    const currency = session.currency || 'usd';

    if (existing) {
        // Older rows predate the unified payment fields. Fill them in without
        // overwriting any value that is already present.
        const patch = { status: 'paid', paymentStatus: 'paid' };
        if (!existing.type) patch.type = 'booking';
        if (!existing.createdAt) patch.createdAt = paidAt;
        if (!existing.currency) patch.currency = currency;
        if (!existing.transactionId) patch.transactionId = transactionId;
        if (typeof existing.amount !== 'number' && typeof session.amount_total === 'number') {
            patch.amount = session.amount_total / 100;
        }
        const receiptUrl = await resolveReceiptUrl(session);
        if (receiptUrl && !existing.receiptUrl) patch.receiptUrl = receiptUrl;
        await payments.updateOne({ _id: existing._id }, { $set: patch });
        await markBookingPaid(existing.bookingId ?? bookingId);
        return { ...existing, ...patch };
    }

    const bookings = await bookingsCollection();
    const booking = await bookings.findOne({ _id: bookingId });
    if (!booking)
        throw notFound('Booking for this payment was not found');
    const receiptUrl = await resolveReceiptUrl(session);
    const document = {
        _id: new ObjectId(),
        type: 'booking',
        bookingId,
        serviceTitle: booking.serviceTitle,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        technicianName: booking.technicianName,
        technicianEmail: booking.technicianEmail,
        amount: (session.amount_total ?? Math.round(booking.finalAmount * 100)) / 100,
        currency,
        transactionId,
        receiptUrl,
        stripeSessionId: session.id,
        paymentStatus: 'paid',
        status: 'paid',
        paidAt,
        createdAt: paidAt,
    };
    let insertedId;
    try {
        const result = await payments.insertOne(document);
        insertedId = result.insertedId;
    }
    catch (error) {
        if (isDuplicateKeyError(error)) {
            const saved = await payments.findOne({
                $or: [{ stripeSessionId: session.id }, { bookingId }],
            });
            if (saved) {
                await markBookingPaid(saved.bookingId ?? bookingId);
                return saved;
            }
        }
        throw error;
    }
    await markBookingPaid(bookingId);
    return { ...document, _id: insertedId };
}
