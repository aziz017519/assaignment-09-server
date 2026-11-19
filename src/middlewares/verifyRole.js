import { findUserByEmail } from '../services/user.service.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import { toIdString } from '../utils/objectId.js';
import { asyncHandler } from './asyncHandler.js';
export function requireRole(role) {
    return asyncHandler(async (req, _res, next) => {
        if (!req.user?.email)
            throw unauthorized();
        // The role is always read from the database, never from the token or client input.
        const user = await findUserByEmail(req.user.email);
        if (!user)
            throw unauthorized('Account no longer exists');
        if (user.role !== role)
            throw forbidden(`Only ${role} accounts can perform this action`);
        req.dbUser = user;
        req.user.role = user.role;
        req.user.id = toIdString(user._id);
        req.user.name = user.name;
        next();
    });
}
