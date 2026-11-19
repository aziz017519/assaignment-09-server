import { Router } from 'express';
import { stripeWebhookHandler } from '../controllers/webhook.controller.js';
const router = Router();
router.post('/stripe', stripeWebhookHandler);
export default router;
