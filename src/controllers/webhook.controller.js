import { getStripe, getWebhookSecret } from '../config/stripe.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { savePaymentOnce } from '../services/payment.service.js';
import { badRequest } from '../utils/errors.js';
import { sendSuccess } from '../utils/response.js';

export const stripeWebhookHandler = asyncHandler(async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string')
        throw badRequest('Missing Stripe signature');
    let event;
    try {
        event = getStripe().webhooks.constructEvent(req.body, signature, getWebhookSecret());
    }
    catch {
        throw badRequest('Invalid Stripe signature');
    }
    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object;
            // Only booking Checkout Sessions carry a bookingId. Any other
            // completed session is ignored so Stripe does not retry it.
            if (session.metadata?.bookingId)
                await savePaymentOnce(session);
            break;
        }
        default:
            // Unknown/ignored events still get a 200 so Stripe stops retrying.
            break;
    }
    sendSuccess(res, { received: true, type: event.type });
});
