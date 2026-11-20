import { Router } from 'express';
import {
    createCheckoutSession,
    createPortalSession,
    getSubscription,
    getSubscriptionPayments,
} from '../controllers/subscription.controller.js';
import { verifyTechnician } from '../middlewares/verifyTechnician.js';
import { verifyToken } from '../middlewares/verifyToken.js';
const router = Router();
router.use(verifyToken, verifyTechnician);
router.get('/', getSubscription);
router.get('/payments', getSubscriptionPayments);
router.post('/checkout', createCheckoutSession);
router.post('/portal', createPortalSession);
export default router;
