import { ObjectId } from 'mongodb';
import { authUsersCollection, paymentsCollection, servicesCollection, usersCollection } from '../config/db.js';
import { env, getAppUrl } from '../config/env.js';
import { getProPriceId, getStripe } from '../config/stripe.js';
import { badRequest, notFound } from '../utils/errors.js';
import { toIdString } from '../utils/objectId.js';
import { findUserByEmail, findUserById, updateUserById } from './user.service.js';

export const FREE_SERVICE_LIMIT = 3;
const SUBSCRIPTION_TYPE = 'subscription';
const BOOKING_TYPE = 'booking';

function isDuplicateKeyError(error) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}
function idOf(value) {
    if (!value)
        return null;
    return typeof value === 'string' ? value : (value.id ?? null);
}
function dateFromSeconds(seconds) {
    return typeof seconds === 'number' && Number.isFinite(seconds)
        ? new Date(seconds * 1000)
        : null;
}
export function normalizePlan(user) {
    return user?.plan === 'pro' ? 'pro' : 'free';
}
async function findUserByStripeCustomerId(customerId) {
    if (!customerId)
        return null;
    for (const getCollection of [usersCollection, authUsersCollection]) {
        const user = await (await getCollection()).findOne({ stripeCustomerId: customerId });
        if (user)
            return user;
    }
    return null;
}
async function resolveUserId(object) {
    const userId = object?.metadata?.userId ??
        object?.subscription_details?.metadata?.userId ??
        object?.lines?.data?.[0]?.metadata?.userId;
    if (userId)
        return userId;
    const customerId = idOf(object?.customer);
    if (customerId) {
        const byCustomer = await findUserByStripeCustomerId(customerId);
        if (byCustomer)
            return byCustomer._id;
    }
    const subscriptionId = idOf(object?.subscription);
    if (subscriptionId) {
        try {
            const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
            return subscription.metadata?.userId ?? null;
        }
        catch (error) {
            console.warn('[fixmate:stripe] could not resolve subscription owner:', error.message);
        }
    }
    return null;
}

/* ---------------------------- technician endpoints --------------------------- */

export async function getSubscriptionStatus(email) {
    const user = await findUserByEmail(email);
    if (!user)
        throw notFound('User not found');
    const plan = normalizePlan(user);
    const serviceCount = await (await servicesCollection()).countDocuments({
        technicianEmail: email.toLowerCase(),
    });
    let price = null;
    if (env.STRIPE_PRO_PRICE_ID) {
        try {
            const stripePrice = await getStripe().prices.retrieve(env.STRIPE_PRO_PRICE_ID);
            price = {
                amount: (stripePrice.unit_amount ?? 0) / 100,
                currency: stripePrice.currency || 'usd',
                interval: stripePrice.recurring?.interval ?? 'month',
            };
        }
        catch (error) {
            console.warn('[fixmate:stripe] could not retrieve the Pro price:', error.message);
        }
    }
    return {
        plan,
        planExpiresAt: user.planExpiresAt ?? null,
        serviceCount,
        serviceLimit: plan === 'pro' ? null : FREE_SERVICE_LIMIT,
        hasSubscription: Boolean(user.stripeSubscriptionId),
        price,
    };
}
export async function getTechnicianPayments(email) {
    const payments = await paymentsCollection();
    const data = await payments
        .find({ technicianEmail: email.toLowerCase() })
        .sort({ paidAt: -1, createdAt: -1 })
        .toArray();
    return data.map((payment) => ({
        id: toIdString(payment._id),
        type: payment.type === SUBSCRIPTION_TYPE ? SUBSCRIPTION_TYPE : BOOKING_TYPE,
        label: payment.type === SUBSCRIPTION_TYPE
            ? 'Pro subscription'
            : (payment.serviceTitle || 'Booking payment'),
        amount: Number(payment.amount) || 0,
        currency: payment.currency || 'usd',
        status: payment.paymentStatus || payment.status || 'paid',
        createdAt: payment.paidAt ?? payment.createdAt ?? null,
        transactionId: payment.transactionId ?? null,
        receiptUrl:
            typeof payment.receiptUrl === 'string' && payment.receiptUrl.startsWith('https://')
                ? payment.receiptUrl
                : null,
    }));
}

/* -------------------------------- checkout ---------------------------------- */

async function resolveStripeCustomer(user) {
    const stripe = getStripe();
    if (user.stripeCustomerId) {
        try {
            const customer = await stripe.customers.retrieve(user.stripeCustomerId);
            if (!customer.deleted)
                return customer;
        }
        catch (error) {
            console.warn('[fixmate:stripe] stored customer was not found, creating a new one:', error.message);
        }
    }
    const existing = await stripe.customers.list({ email: user.email, limit: 1 });
    const customer = existing.data[0] ?? await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: toIdString(user._id) },
    });
    await updateUserById(user._id, { stripeCustomerId: customer.id });
    return customer;
}
export async function createSubscriptionCheckout(user) {
    const stripe = getStripe();
    const priceId = getProPriceId();
    const customer = await resolveStripeCustomer(user);
    const appUrl = getAppUrl().replace(/\/$/, '');
    const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customer.id,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl}/dashboard/technician/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/dashboard/technician/subscription?status=cancelled`,
        metadata: { type: SUBSCRIPTION_TYPE, userId: toIdString(user._id) },
        subscription_data: { metadata: { type: SUBSCRIPTION_TYPE, userId: toIdString(user._id) } },
        allow_promotion_codes: true,
    });
    if (!session.url)
        throw badRequest('Stripe did not return a checkout URL');
    return { url: session.url, sessionId: session.id };
}
export async function createBillingPortalSession(user) {
    if (!user.stripeCustomerId) {
        throw badRequest('No Stripe billing account is linked yet. Start a Pro subscription first.');
    }
    const appUrl = getAppUrl().replace(/\/$/, '');
    const session = await getStripe().billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${appUrl}/dashboard/technician/subscription`,
    });
    if (!session.url)
        throw badRequest('Stripe did not return a billing portal URL');
    return { url: session.url };
}

/* --------------------------------- webhooks --------------------------------- */

export async function handleCheckoutCompleted(session) {
    if (session.mode !== SUBSCRIPTION_TYPE)
        return;
    const userId = await resolveUserId(session);
    if (!userId) {
        console.warn('[fixmate:stripe] checkout.session.completed is missing a userId');
        return;
    }
    const customerId = idOf(session.customer);
    const subscriptionId = idOf(session.subscription);
    const updated = await updateUserById(userId, {
        plan: 'pro',
        ...(customerId ? { stripeCustomerId: customerId } : {}),
        ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
        updatedAt: new Date(),
    });
    if (!updated)
        console.warn('[fixmate:stripe] checkout completed for an unknown user:', userId);
}
export async function handleInvoicePaymentSucceeded(invoice) {
    const payments = await paymentsCollection();
    if (await payments.findOne({ stripeInvoiceId: invoice.id })) {
        console.info('[fixmate:stripe] invoice already recorded:', invoice.id);
        return;
    }
    const userId = await resolveUserId(invoice);
    if (!userId) {
        console.warn('[fixmate:stripe] invoice.payment_succeeded is missing a userId:', invoice.id);
        return;
    }
    const user = await findUserById(userId);
    if (!user) {
        console.warn('[fixmate:stripe] invoice belongs to an unknown user:', userId);
        return;
    }
    const amount = (invoice.amount_paid ?? invoice.total ?? 0) / 100;
    const periodEnd = dateFromSeconds(invoice.lines?.data?.[0]?.period?.end);
    const paidAt = dateFromSeconds(invoice.status_transitions?.paid_at) ?? dateFromSeconds(invoice.created) ?? new Date();
    const document = {
        _id: new ObjectId(),
        type: SUBSCRIPTION_TYPE,
        userId: user._id,
        technicianEmail: user.email.toLowerCase(),
        technicianName: user.name,
        amount,
        currency: invoice.currency || 'usd',
        stripeInvoiceId: invoice.id,
        stripeSubscriptionId: idOf(invoice.subscription),
        stripeCustomerId: idOf(invoice.customer),
        transactionId: invoice.id,
        receiptUrl:
            (typeof invoice.hosted_invoice_url === 'string' && invoice.hosted_invoice_url.startsWith('https://')
                ? invoice.hosted_invoice_url
                : typeof invoice.invoice_pdf === 'string' && invoice.invoice_pdf.startsWith('https://')
                    ? invoice.invoice_pdf
                    : null),
        paymentStatus: 'paid',
        status: 'paid',
        paidAt,
        createdAt: paidAt,
    };
    try {
        await payments.insertOne(document);
    }
    catch (error) {
        if (isDuplicateKeyError(error)) {
            console.info('[fixmate:stripe] invoice inserted concurrently:', invoice.id);
            return;
        }
        throw error;
    }
    await updateUserById(user._id, {
        plan: 'pro',
        stripeCustomerId: document.stripeCustomerId ?? user.stripeCustomerId,
        stripeSubscriptionId: document.stripeSubscriptionId ?? user.stripeSubscriptionId,
        ...(periodEnd ? { planExpiresAt: periodEnd } : {}),
        updatedAt: new Date(),
    });
}
export async function handleInvoicePaymentFailed(invoice) {
    console.warn('[fixmate:stripe] invoice.payment_failed:', {
        invoiceId: invoice.id,
        customer: idOf(invoice.customer),
        subscription: idOf(invoice.subscription),
    });
}
export async function handleSubscriptionChanged(subscription, { deleted = false } = {}) {
    const status = subscription.status;
    const shouldDowngrade = deleted || ['canceled', 'unpaid', 'incomplete_expired'].includes(status);
    if (!shouldDowngrade)
        return;
    const userId = await resolveUserId(subscription);
    if (!userId) {
        console.warn('[fixmate:stripe] subscription change is missing a userId:', subscription.id);
        return;
    }
    const updated = await updateUserById(userId, { plan: 'free', updatedAt: new Date() });
    if (updated)
        console.info('[fixmate:stripe] plan reset to free for user:', userId, 'reason:', deleted ? 'deleted' : status);
}
