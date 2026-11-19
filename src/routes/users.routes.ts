import { Router } from 'express';
import {
  getMe,
  getRoleStats,
  signup,
  updateProfile,
  userSchemas,
} from '../controllers/users.controller';
import { validate } from '../middlewares/validate';
import { verifyToken } from '../middlewares/verifyToken';

const router = Router();

router.post('/signup', validate({ body: userSchemas.signup }), signup);
router.get('/me', verifyToken, getMe);
router.patch('/profile', verifyToken, validate({ body: userSchemas.profile }), updateProfile);
router.get('/stats', verifyToken, getRoleStats);

export default router;
