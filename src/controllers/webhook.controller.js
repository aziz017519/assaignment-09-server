import { getStripe, getWebhookSecret } from '../config/stripe.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { savePaymentOnce } from '../services/payment.service.js';
import {
    handleCheckoutCompleted,
    handleInvoicePaymentFailed,
    handleInvoicePaymentSucceeded,
    handleSubscriptionChanged,
} from '../services/subscription.service.js';
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
            if (session.mode === 'subscription') {
                await handleCheckoutCompleted(session);
            } else {
                await savePaymentOnce(session);
            }
            break;
        }
        case 'invoice.payment_succeeded':
            await handleInvoicePaymentSucceeded(event.data.object);
            break;
        case 'invoice.payment_failed':
            handleInvoicePaymentFailed(event.data.object);
            break;
        case 'customer.subscription.deleted':
            await handleSubscriptionChanged(event.data.object, { deleted: true });
            break;
        case 'customer.subscription.updated':
            await handleSubscriptionChanged(event.data.object);
            break;
        default:
            break;
    }
    sendSuccess(res, { received: true, type: event.type });
});
