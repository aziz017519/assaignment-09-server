import type { Request } from 'express';
import type Stripe from 'stripe';
import { getStripe, getWebhookSecret } from '../config/stripe';
import { asyncHandler } from '../middlewares/asyncHandler';
import { savePaymentOnce } from '../services/payment.service';
import { badRequest } from '../utils/errors';
import { sendSuccess } from '../utils/response';

export const stripeWebhookHandler = asyncHandler(async (req: Request, res) => {
  const signature = req.headers['stripe-signature'];
  if (typeof signature !== 'string') throw badRequest('Missing Stripe signature');

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      req.body as Buffer,
      signature,
      getWebhookSecret(),
    );
  } catch {
    throw badRequest('Invalid Stripe signature');
  }

  if (event.type === 'checkout.session.completed') {
    await savePaymentOnce(event.data.object as Stripe.Checkout.Session);
  }

  sendSuccess(res, { received: true });
});
