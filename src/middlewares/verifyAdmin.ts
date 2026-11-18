import { requireRole } from './verifyRole';

export const verifyAdmin = requireRole('admin');
