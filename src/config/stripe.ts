import Stripe from 'stripe';
import { env, requireStripeConfig } from './env';

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in .env.');
  }
  if (!client) {
    client = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return client;
}

export function getWebhookSecret(): string {
  return requireStripeConfig().webhookSecret;
}
