import { asyncHandler } from '../middlewares/asyncHandler.js';
import {
    createBillingPortalSession,
    createSubscriptionCheckout,
    getSubscriptionStatus,
    getTechnicianPayments,
} from '../services/subscription.service.js';
import { AppError } from '../utils/errors.js';
import { sendError, sendSuccess } from '../utils/response.js';

// Stripe errors carry useful diagnostics, but keys and full request metadata
// must never be returned to the browser. Log a small whitelist server-side.
function logCheckoutError(error) {
    console.error('[fixmate:subscription] checkout failed:', {
        name: error?.name ?? 'Error',
        type: error?.type ?? null,
        code: error?.code ?? null,
        param: error?.param ?? null,
        statusCode: error?.statusCode ?? null,
        requestId: error?.requestId ?? null,
        message: error?.message ?? String(error),
    });
}

function checkoutFailure(error) {
    if (error instanceof AppError) {
        return {
            statusCode: error.statusCode,
            message: error.message,
            code: error.code ?? 'CHECKOUT_FAILED',
        };
    }
    const message = typeof error?.message === 'string' ? error.message : '';
    const type = typeof error?.type === 'string' ? error.type : '';
    const param = typeof error?.param === 'string' ? error.param : '';
    if (message.includes('STRIPE_')) {
        return {
            statusCode: 500,
            message: 'Billing is not configured correctly on the server.',
            code: 'BILLING_CONFIG_ERROR',
        };
    }
    if (type === 'StripeInvalidRequestError') {
        if (param.includes('price') || /price|product/i.test(message)) {
            return {
                statusCode: 400,
                message: 'The configured Stripe Pro price is invalid for this account or mode.',
                code: 'INVALID_PRO_PRICE',
            };
        }
        if (/customer/i.test(message)) {
            return {
                statusCode: 400,
                message: 'Stripe could not use the billing customer for this account.',
                code: 'STRIPE_CUSTOMER_ERROR',
            };
        }
        return {
            statusCode: 400,
            message: 'Stripe rejected the checkout request.',
            code: 'STRIPE_INVALID_REQUEST',
        };
    }
    if (type.startsWith('Stripe')) {
        return {
            statusCode: 500,
            message: 'Stripe could not create the checkout session. Please try again.',
            code: 'STRIPE_CHECKOUT_FAILED',
        };
    }
    return {
        statusCode: 500,
        message: 'Could not create the checkout session. Please try again.',
        code: 'CHECKOUT_FAILED',
    };
}

export const getSubscription = asyncHandler(async (req, res) => {
    const status = await getSubscriptionStatus(req.user.email);
    sendSuccess(res, status);
});
export const getSubscriptionPayments = asyncHandler(async (req, res) => {
    const payments = await getTechnicianPayments(req.user.email);
    sendSuccess(res, payments);
});
export const createCheckoutSession = asyncHandler(async (req, res) => {
    try {
        const result = await createSubscriptionCheckout(req.dbUser);
        sendSuccess(res, result, 'Stripe checkout session created');
    }
    catch (error) {
        logCheckoutError(error);
        const failure = checkoutFailure(error);
        sendError(res, failure.statusCode, failure.message, failure.code);
    }
});
export const createPortalSession = asyncHandler(async (req, res) => {
    try {
        const result = await createBillingPortalSession(req.dbUser);
        sendSuccess(res, result, 'Billing portal session created');
    }
    catch (error) {
        logCheckoutError(error);
        const failure = checkoutFailure(error);
        sendError(res, failure.statusCode, failure.message, failure.code);
    }
});
