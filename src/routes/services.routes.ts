import { Router } from 'express';
import {
  createService,
  deleteService,
  getMyServices,
  getServiceById,
  listServices,
  serviceSchemas,
  toggleAvailability,
  updateService,
} from '../controllers/services.controller';
import { validate } from '../middlewares/validate';
import { verifyToken } from '../middlewares/verifyToken';
import { verifyTechnician } from '../middlewares/verifyTechnician';

const router = Router();

router.get('/', validate({ query: serviceSchemas.list }), listServices);
router.get('/my', verifyToken, verifyTechnician, getMyServices);
router.get('/:id', validate({ params: serviceSchemas.params }), getServiceById);
router.post(
  '/',
  verifyToken,
  verifyTechnician,
  validate({ body: serviceSchemas.create }),
  createService,
);
router.patch(
  '/:id',
  verifyToken,
  verifyTechnician,
  validate({ params: serviceSchemas.params, body: serviceSchemas.update }),
  updateService,
);
router.patch(
  '/:id/availability',
  verifyToken,
  verifyTechnician,
  validate({ params: serviceSchemas.params, body: serviceSchemas.availability }),
  toggleAvailability,
);
router.delete(
  '/:id',
  verifyToken,
  verifyTechnician,
  validate({ params: serviceSchemas.params }),
  deleteService,
);

export default router;
