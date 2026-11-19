import { z } from 'zod';
import { bookingsCollection, paymentsCollection } from '../config/db.js';
import { env } from '../config/env.js';
import { getStripe } from '../config/stripe.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { savePaymentOnce } from '../services/payment.service.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { parseObjectId } from '../utils/objectId.js';
import { sendSuccess } from '../utils/response.js';
const createCheckoutSchema = z.object({ bookingId: z.string().min(1) });
const verifyQuerySchema = z.object({ session_id: z.string().min(1) });
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
        success_url: `${env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.CLIENT_URL}/payment/cancel`,
        metadata: { bookingId: booking._id.toHexString(), customerEmail: email },
    });
    if (!session.url)
        throw badRequest('Stripe did not return a checkout URL');
    sendSuccess(res, { url: session.url, sessionId: session.id });
});
export const verifyPayment = asyncHandler(async (req, res) => {
    const { session_id: sessionId } = req.query;
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
        throw badRequest('Payment is not completed yet');
    }
    if (session.metadata?.customerEmail?.toLowerCase() !== req.user.email.toLowerCase()) {
        throw forbidden('This payment does not belong to you');
    }
    const payment = await savePaymentOnce(session);
    sendSuccess(res, {
        amount: payment.amount,
        transactionId: payment.transactionId,
        bookingId: payment.bookingId.toHexString(),
        paymentStatus: payment.paymentStatus,
    });
});
export const getMyPayments = asyncHandler(async (req, res) => {
    const payments = await paymentsCollection();
    const data = await payments
        .find({ customerEmail: req.user.email.toLowerCase() })
        .sort({ paidAt: -1 })
        .toArray();
    sendSuccess(res, data);
});
export const paymentSchemas = { create: createCheckoutSchema, verify: verifyQuerySchema };
