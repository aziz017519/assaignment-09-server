import Stripe from 'stripe';
import { env, requireStripeConfig, requireStripePriceId } from './env.js';
let client = null;
export function getStripe() {
    if (!env.STRIPE_SECRET_KEY) {
        throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in .env.');
    }
    if (!client) {
        client = new Stripe(env.STRIPE_SECRET_KEY);
    }
    return client;
}
export function getWebhookSecret() {
    return requireStripeConfig().webhookSecret;
}
export function getProPriceId() {
    return requireStripePriceId();
}
