import { Router } from 'express';
import {
  adminSchemas,
  getBookings,
  getPayments,
  getServices,
  getStats,
  getUsers,
  updateServiceApproval,
  updateUserRole,
} from '../controllers/admin.controller';
import { validate } from '../middlewares/validate';
import { verifyAdmin } from '../middlewares/verifyAdmin';
import { verifyToken } from '../middlewares/verifyToken';

const router = Router();

router.use(verifyToken, verifyAdmin);

router.get('/users', getUsers);
router.patch(
  '/users/:id/role',
  validate({ params: adminSchemas.params, body: adminSchemas.role }),
  updateUserRole,
);
router.get('/services', validate({ query: adminSchemas.listServices }), getServices);
router.patch(
  '/services/:id/approval',
  validate({ params: adminSchemas.params, body: adminSchemas.approval }),
  updateServiceApproval,
);
router.get('/bookings', validate({ query: adminSchemas.listBookings }), getBookings);
router.get('/payments', getPayments);
router.get('/stats', getStats);

export default router;
