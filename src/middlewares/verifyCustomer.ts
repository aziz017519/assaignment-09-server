import { requireRole } from './verifyRole';

export const verifyCustomer = requireRole('customer');
