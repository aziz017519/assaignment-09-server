import { Router } from 'express';
import {
  bookingSchemas,
  cancelBooking,
  createBooking,
  getMyBookings,
  getTechnicianBookings,
  updateBookingStatus,
} from '../controllers/bookings.controller';
import { validate } from '../middlewares/validate';
import { verifyCustomer } from '../middlewares/verifyCustomer';
import { verifyTechnician } from '../middlewares/verifyTechnician';
import { verifyToken } from '../middlewares/verifyToken';

const router = Router();

router.post(
  '/',
  verifyToken,
  verifyCustomer,
  validate({ body: bookingSchemas.create }),
  createBooking,
);
router.get(
  '/my',
  verifyToken,
  verifyCustomer,
  validate({ query: bookingSchemas.list }),
  getMyBookings,
);
router.get(
  '/technician',
  verifyToken,
  verifyTechnician,
  validate({ query: bookingSchemas.list }),
  getTechnicianBookings,
);
router.patch(
  '/:id/cancel',
  verifyToken,
  verifyCustomer,
  validate({ params: bookingSchemas.params }),
  cancelBooking,
);
router.patch(
  '/:id/status',
  verifyToken,
  verifyTechnician,
  validate({ params: bookingSchemas.params, body: bookingSchemas.updateStatus }),
  updateBookingStatus,
);

export default router;
