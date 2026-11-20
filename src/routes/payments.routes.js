import { Router } from 'express';
import { createCheckoutSession, getMyPayments, paymentSchemas, verifyPayment, } from '../controllers/payments.controller.js';
import { validate } from '../middlewares/validate.js';
import { verifyCustomer } from '../middlewares/verifyCustomer.js';
import { verifyToken } from '../middlewares/verifyToken.js';
const router = Router();
router.post('/create-checkout-session', verifyToken, verifyCustomer, validate({ body: paymentSchemas.create }), createCheckoutSession);
// Both customers and technicians verify their own Checkout Session here; the
// controller enforces metadata.userId ownership instead of a role middleware.
router.get('/verify', verifyToken, validate({ query: paymentSchemas.verify }), verifyPayment);
router.get('/my', verifyToken, verifyCustomer, getMyPayments);
export default router;
