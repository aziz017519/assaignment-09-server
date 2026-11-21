import { Router } from 'express';
import { getMe, getRoleStats, signup, updateProfile, userSchemas, } from '../controllers/users.controller.js';
import { validate } from '../middlewares/validate.js';
import { verifyToken } from '../middlewares/verifyToken.js';
const router = Router();
router.post('/signup', validate({ body: userSchemas.signup }), signup);
router.get('/me', verifyToken, getMe);
// Alias used by the shared profile form. Same handler and ownership checks as /me.
router.get('/profile', verifyToken, getMe);
router.patch('/profile', verifyToken, validate({ body: userSchemas.profile }), updateProfile);
router.get('/stats', verifyToken, getRoleStats);
export default router;
