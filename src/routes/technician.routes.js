import { Router } from 'express';
import { getStats } from '../controllers/technician.controller.js';
import { verifyTechnician } from '../middlewares/verifyTechnician.js';
import { verifyToken } from '../middlewares/verifyToken.js';

const router = Router();
router.use(verifyToken, verifyTechnician);
router.get('/stats', getStats);
export default router;
