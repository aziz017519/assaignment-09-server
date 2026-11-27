import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getTechnicianStats } from '../services/technician.service.js';
import { sendSuccess } from '../utils/response.js';

export const getStats = asyncHandler(async (req, res) => {
    // Email/id come from the verified token/session via verifyToken and
    // verifyTechnician. No client-supplied technician id is accepted.
    const stats = await getTechnicianStats(req.user.email);
    sendSuccess(res, stats);
});
