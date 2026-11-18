import { Router } from 'express';
import {
  createCheckoutSession,
  getMyPayments,
  paymentSchemas,
  verifyPayment,
} from '../controllers/payments.controller';
import { validate } from '../middlewares/validate';
import { verifyCustomer } from '../middlewares/verifyCustomer';
import { verifyToken } from '../middlewares/verifyToken';

const router = Router();

router.post(
  '/create-checkout-session',
  verifyToken,
  verifyCustomer,
  validate({ body: paymentSchemas.create }),
  createCheckoutSession,
);
router.get(
  '/verify',
  verifyToken,
  verifyCustomer,
  validate({ query: paymentSchemas.verify }),
  verifyPayment,
);
router.get('/my', verifyToken, verifyCustomer, getMyPayments);

export default router;
