import { requireRole } from './verifyRole.js';
export const verifyAdmin = requireRole('admin');
