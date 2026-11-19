import type { UserRole } from '../types/models';

/** Only customers and technicians may self-register; every other value falls back to customer. */
export function normalizeSignupRole(role: unknown): Extract<UserRole, 'customer' | 'technician'> {
  return role === 'technician' ? 'technician' : 'customer';
}
