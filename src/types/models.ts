import type { ObjectId } from 'mongodb';

export type UserRole = 'customer' | 'technician' | 'admin';

export type UserDoc = {
  _id: ObjectId;
  name: string;
  email: string;
  image?: string;
  role: UserRole;
  phone?: string;
  area?: string;
  bio?: string;
  plan?: 'free' | 'pro';
  emailVerified?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

export type ServiceCategory =
  | 'Smartphone'
  | 'Laptop & PC'
  | 'AC'
  | 'Refrigerator'
  | 'TV'
  | 'Washing Machine'
  | 'Electrical';

export type ServiceMode = 'Home Visit' | 'Shop Drop-off';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type ServiceDoc = {
  _id: ObjectId;
  title: string;
  category: ServiceCategory;
  description: string;
  image: string;
  basePrice: number;
  estimatedDuration: string;
  serviceMode: ServiceMode;
  serviceArea: string;
  technicianName: string;
  technicianEmail: string;
  approvalStatus: ApprovalStatus;
  isAvailable: boolean;
  createdAt: Date;
};

export type BookingStatus =
  | 'requested'
  | 'accepted'
  | 'rejected'
  | 'in-progress'
  | 'completed'
  | 'cancelled';

export type StatusHistoryEntry = { status: BookingStatus; changedAt: Date };

export type BookingDoc = {
  _id: ObjectId;
  serviceId: ObjectId;
  serviceTitle: string;
  serviceImage: string;
  category: ServiceCategory;
  basePrice: number;
  technicianName: string;
  technicianEmail: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  address: string;
  preferredDate: Date;
  problemDescription: string;
  status: BookingStatus;
  finalAmount: number;
  paymentStatus: 'unpaid' | 'paid';
  statusHistory?: StatusHistoryEntry[];
  rating?: number;
  review?: string;
  createdAt?: Date;
};

export type PaymentDoc = {
  _id: ObjectId;
  bookingId: ObjectId;
  serviceTitle: string;
  customerName: string;
  customerEmail: string;
  technicianName: string;
  technicianEmail: string;
  amount: number;
  currency: 'usd';
  transactionId: string;
  stripeSessionId: string;
  paymentStatus: 'paid';
  paidAt: Date;
};

export type SessionDoc = {
  _id: ObjectId;
  token: string;
  userId: string;
  expiresAt: Date;
};
