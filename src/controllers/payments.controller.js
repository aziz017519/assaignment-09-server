import { z } from 'zod';
import { bookingsCollection, paymentsCollection } from '../config/db.js';
import { getAppUrl } from '../config/env.js';
import { getStripe } from '../config/stripe.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { parseObjectId, toIdString } from '../utils/objectId.js';
import { sendSuccess } from '../utils/response.js';

const createCheckoutSchema = z.object({ bookingId: z.string().min(1) });
const verifyQuerySchema = z.object({ session_id: z.string().min(1) });
const BOOKING_TYPE = 'booking';
const SUBSCRIPTION_TYPE = 'subscription';

function idOf(value) {
    if (!value)
        return null;
    return typeof value === 'string' ? value : (value.id ?? null);
}
function objectFrom(value) {
    return value && typeof value === 'object' && !value.deleted ? value : null;
}
function dateFromSeconds(seconds) {
    return typeof seconds === 'number' && Number.isFinite(seconds)
        ? new Date(seconds * 1000)
        : null;
}
function isoOrNull(value) {
    if (!value)
        return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function safeUrl(value) {
    return typeof value === 'string' && value.startsWith('https://') ? value : null;
}
function titleCase(value) {
    return String(value || '')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
        .trim();
}
function describePaymentMethod(session, paymentIntent, subscription) {
    const charge = objectFrom(paymentIntent?.latest_charge);
    const paymentMethod = objectFrom(paymentIntent?.payment_method);
    const defaultMethod = objectFrom(subscription?.default_payment_method);
    const card =
        charge?.payment_method_details?.card ??
        paymentMethod?.card ??
        defaultMethod?.card ??
        null;
    if (card?.brand && card?.last4) {
        return `${titleCase(card.brand)} •••• ${card.last4}`;
    }
    const type = session.payment_method_types?.find((item) => item === 'card') ??
        session.payment_method_types?.[0] ??
        'card';
    return titleCase(type) || 'Card';
}
function ticketIdFor(booking) {
    if (typeof booking.ticketId === 'string' && booking.ticketId.trim())
        return booking.ticketId;
    return `FM-${toIdString(booking._id)?.slice(-6).toUpperCase() || 'BOOKING'}`;
}
function intervalFrom(session, subscription, invoice) {
    const interval =
        subscription?.items?.data?.[0]?.price?.recurring?.interval ??
        invoice?.lines?.data?.[0]?.price?.recurring?.interval ??
        invoice?.lines?.data?.[0]?.period?.interval;
    return ['month', 'year', 'week', 'day'].includes(interval) ? interval : 'month';
}

export const createCheckoutSession = asyncHandler(async (req, res) => {
    const { bookingId } = req.body;
    const email = req.user.email.toLowerCase();
    const bookings = await bookingsCollection();
    const booking = await bookings.findOne({ _id: parseObjectId(bookingId, 'booking id') });
    if (!booking)
        throw notFound('Booking not found');
    if (booking.customerEmail.toLowerCase() !== email) {
        throw forbidden('You can only pay for your own bookings');
    }
    if (booking.status !== 'completed') {
        throw badRequest('Only completed bookings can be paid for');
    }
    if (booking.paymentStatus === 'paid') {
        throw badRequest('This booking is already paid');
    }
    const appUrl = getAppUrl().replace(/\/$/, '');
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
            {
                quantity: 1,
                price_data: {
                    currency: 'usd',
                    unit_amount: Math.round(booking.finalAmount * 100),
                    product_data: { name: booking.serviceTitle },
                },
            },
        ],
        success_url: `${appUrl}/dashboard/customer/payments/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/dashboard/customer/bookings?status=cancelled`,
        metadata: {
            type: BOOKING_TYPE,
            userId: req.user.id,
            bookingId: toIdString(booking._id),
            customerEmail: email,
        },
    });
    if (!session.url)
        throw badRequest('Stripe did not return a checkout URL');
    sendSuccess(res, { url: session.url, sessionId: session.id });
});

/**
 * Read-only Checkout Session verification for the shared payment success page.
 * Stripe webhooks remain the only writer of booking/payment/plan state.
 */
export const verifyPayment = asyncHandler(async (req, res) => {
    const { session_id: sessionId } = req.query;
    const stripe = getStripe();

    let basicSession;
    try {
        basicSession = await stripe.checkout.sessions.retrieve(sessionId);
    }
    catch {
        throw badRequest('Invalid checkout session');
    }
    // Ownership comes from the server-created metadata, never from the query string.
    if (basicSession.metadata?.userId !== req.user.id) {
        throw forbidden('This payment does not belong to you');
    }

    const expand = ['payment_intent', 'payment_intent.latest_charge'];
    if (basicSession.mode === SUBSCRIPTION_TYPE) {
        expand.push('subscription', 'subscription.default_payment_method', 'invoice');
    }
    let session = basicSession;
    try {
        session = await stripe.checkout.sessions.retrieve(sessionId, { expand });
    }
    catch {
        // Keep the basic session so an unsupported expand path cannot break the page.
    }

    const type = session.mode === SUBSCRIPTION_TYPE ? SUBSCRIPTION_TYPE : BOOKING_TYPE;
    const paymentIntent = objectFrom(session.payment_intent);
    const subscription = objectFrom(session.subscription) ?? objectFrom(basicSession.subscription);
    const invoice = objectFrom(session.invoice) ?? objectFrom(basicSession.invoice);
    const charge = objectFrom(paymentIntent?.latest_charge);
    const transactionId =
        (type === SUBSCRIPTION_TYPE
            ? idOf(invoice) ?? idOf(basicSession.invoice)
            : idOf(paymentIntent) ?? idOf(basicSession.payment_intent)) ?? sessionId;
    const amountMinor = type === SUBSCRIPTION_TYPE
        ? (invoice?.amount_paid ?? invoice?.total ?? session.amount_total ?? 0)
        : (session.amount_total ?? basicSession.amount_total ?? 0);
    const paidAt =
        (type === SUBSCRIPTION_TYPE
            ? dateFromSeconds(invoice?.status_transitions?.paid_at)
            : dateFromSeconds(paymentIntent?.created)) ??
        dateFromSeconds(session.created) ??
        new Date();
    const receiptUrl = safeUrl(
        type === SUBSCRIPTION_TYPE
            ? (invoice?.hosted_invoice_url ?? invoice?.invoice_pdf)
            : charge?.receipt_url
    );
    const stripePaid =
        session.payment_status === 'paid' ||
        (session.status === 'complete' && session.payment_status === 'no_payment_required');
    const stripeFailed =
        session.status === 'expired' ||
        session.status === 'rejected' ||
        (session.status === 'complete' && !stripePaid);

    const result = {
        status: stripeFailed ? 'failed' : 'pending',
        type,
        transactionId,
        sessionId,
        amount: Number(amountMinor) / 100,
        currency: String(invoice?.currency ?? session.currency ?? 'usd').toLowerCase(),
        paymentMethod: describePaymentMethod(session, paymentIntent, subscription),
        paidAt: isoOrNull(paidAt),
        receiptUrl,
    };

    if (type === BOOKING_TYPE) {
        const bookingIdValue = session.metadata?.bookingId ?? basicSession.metadata?.bookingId;
        if (bookingIdValue && parseObjectIdSafe(bookingIdValue)) {
            const bookingId = parseObjectId(bookingIdValue, 'booking id');
            const booking = await (await bookingsCollection()).findOne(
                { _id: bookingId },
                { projection: { ticketId: 1, serviceTitle: 1, technicianName: 1, preferredDate: 1, address: 1, paymentStatus: 1 } }
            );
            if (booking) {
                result.booking = {
                    id: toIdString(booking._id),
                    ticketId: ticketIdFor(booking),
                    serviceTitle: booking.serviceTitle || 'Repair service',
                    technicianName: booking.technicianName || 'Technician',
                    preferredDate: isoOrNull(booking.preferredDate),
                    address: booking.address || 'Not specified',
                };
            }
            if (stripePaid && !stripeFailed) {
                const payment = await (await paymentsCollection()).findOne({
                    $or: [{ stripeSessionId: sessionId }, { bookingId }],
                });
                if (booking?.paymentStatus === 'paid' &&
                    (payment?.status === 'paid' || payment?.paymentStatus === 'paid')) {
                    result.status = 'paid';
                }
            }
        }
    }
    else {
        const renewalSeconds =
            subscription?.current_period_end ??
            invoice?.lines?.data?.[0]?.period?.end ??
            null;
        result.subscription = {
            plan: 'pro',
            renewalDate: isoOrNull(dateFromSeconds(renewalSeconds)) ?? isoOrNull(req.dbUser?.planExpiresAt),
            interval: intervalFrom(session, subscription, invoice),
        };
        if (stripePaid && !stripeFailed) {
            const subscriptionId = idOf(subscription) ?? idOf(basicSession.subscription);
            const payment = await (await paymentsCollection()).findOne({
                $or: [
                    { stripeInvoiceId: transactionId },
                    { stripeSessionId: sessionId },
                    ...(subscriptionId ? [{ stripeSubscriptionId: subscriptionId }] : []),
                ],
            });
            if (req.dbUser?.plan === 'pro' && payment) {
                result.status = 'paid';
            }
        }
    }

    sendSuccess(res, result);
});

function parseObjectIdSafe(value) {
    if (typeof value !== 'string')
        return false;
    try {
        parseObjectId(value, 'booking id');
        return true;
    }
    catch {
        return false;
    }
}

export const getMyPayments = asyncHandler(async (req, res) => {
    const payments = await paymentsCollection();
    // Subscription receipts belong to technicians and must never appear in the
    // customer-facing payment history. Legacy rows without a type are bookings.
    const data = await payments
        .find({
            customerEmail: req.user.email.toLowerCase(),
            $or: [{ type: 'booking' }, { type: { $exists: false } }],
        })
        .sort({ paidAt: -1, createdAt: -1 })
        .toArray();
    sendSuccess(res, data.map((payment) => ({
        id: toIdString(payment._id),
        bookingId: toIdString(payment.bookingId) ?? null,
        type: BOOKING_TYPE,
        serviceTitle: payment.serviceTitle || 'Booking payment',
        technicianName: payment.technicianName ?? null,
        amount: Number(payment.amount) || 0,
        currency: payment.currency || 'usd',
        transactionId: payment.transactionId ?? null,
        status: payment.status || payment.paymentStatus || 'paid',
        paidAt: isoOrNull(payment.paidAt),
        createdAt: isoOrNull(payment.createdAt ?? payment.paidAt),
        receiptUrl: safeUrl(payment.receiptUrl),
    })));
});
export const paymentSchemas = { create: createCheckoutSchema, verify: verifyQuerySchema };
