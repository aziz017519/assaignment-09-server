import type {
  BookingStatus,
  ServiceCategory,
  ServiceMode,
  UserRole,
} from '../types/models';

export const USER_ROLES: readonly UserRole[] = ['customer', 'technician', 'admin'];
export const SIGNUP_ROLES: readonly UserRole[] = ['customer', 'technician'];

export const SERVICE_CATEGORIES: readonly ServiceCategory[] = [
  'Smartphone',
  'Laptop & PC',
  'AC',
  'Refrigerator',
  'TV',
  'Washing Machine',
  'Electrical',
];

export const SERVICE_MODES: readonly ServiceMode[] = ['Home Visit', 'Shop Drop-off'];

export const BOOKING_STATUSES: readonly BookingStatus[] = [
  'requested',
  'accepted',
  'rejected',
  'in-progress',
  'completed',
  'cancelled',
];

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const;
