import { Router } from 'express';
import adminRoutes from './admin.routes';
import bookingsRoutes from './bookings.routes';
import paymentsRoutes from './payments.routes';
import servicesRoutes from './services.routes';
import usersRoutes from './users.routes';

const router = Router();

router.use('/services', servicesRoutes);
router.use('/bookings', bookingsRoutes);
router.use('/payments', paymentsRoutes);
router.use('/admin', adminRoutes);
router.use('/users', usersRoutes);

export default router;
