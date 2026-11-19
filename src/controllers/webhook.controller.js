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
    if (event.type === 'checkout.session.completed') {
        await savePaymentOnce(event.data.object);
    }
    sendSuccess(res, { received: true });
});
