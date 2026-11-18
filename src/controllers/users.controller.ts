import { z } from 'zod';
import {
  bookingsCollection,
  paymentsCollection,
  servicesCollection,
  usersCollection,
} from '../config/db';
import { asyncHandler } from '../middlewares/asyncHandler';
import { findUserByEmail } from '../services/user.service';
import { badRequest, notFound } from '../utils/errors';
import { publicUser } from '../utils/sanitize';
import { sendSuccess } from '../utils/response';

const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    phone: z.string().trim().max(20).optional(),
    area: z.string().trim().max(120).optional(),
    bio: z.string().trim().max(500).optional(),
    image: z.string().trim().max(1000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const getMe = asyncHandler(async (req, res) => {
  const user = await findUserByEmail(req.user!.email);
  if (!user) throw notFound('User not found');
  sendSuccess(res, publicUser(user));
});

export const updateProfile = asyncHandler(async (req, res) => {
  const input = req.body as z.infer<typeof profileSchema>;
  const users = await usersCollection();
  const result = await users.findOneAndUpdate(
    { email: req.user!.email.toLowerCase() },
    { $set: { ...input, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!result) throw notFound('User not found');
  sendSuccess(res, publicUser(result), 'Profile updated');
});

function lastSixMonths(): { key: string; label: string }[] {
  const months: { key: string; label: string }[] = [];
  const now = new Date();
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    months.push({
      key: date.toISOString().slice(0, 7),
      label: date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
    });
  }
  return months;
}

function monthlySeries<T extends { createdAt?: Date; paidAt?: Date }>(
  items: T[],
  dateOf: (item: T) => Date | undefined,
): { label: string; count: number }[] {
  const buckets = lastSixMonths();
  const counts = new Map(buckets.map((bucket) => [bucket.key, 0]));
  for (const item of items) {
    const date = dateOf(item);
    if (!date) continue;
    const key = date.toISOString().slice(0, 7);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return buckets.map((bucket) => ({ label: bucket.label, count: counts.get(bucket.key) ?? 0 }));
}

export const getRoleStats = asyncHandler(async (req, res) => {
  const email = req.user!.email.toLowerCase();
  const user = await findUserByEmail(email);
  if (!user) throw notFound('User not found');

  const bookings = await bookingsCollection();
  if (user.role === 'customer') {
    const myBookings = await bookings.find({ customerEmail: email }).toArray();
    const payments = await paymentsCollection();
    const myPayments = await payments.find({ customerEmail: email }).toArray();
    const counts = {
      totalRequests: myBookings.length,
      requested: myBookings.filter((booking) => booking.status === 'requested').length,
      accepted: myBookings.filter((booking) => booking.status === 'accepted').length,
      inProgress: myBookings.filter((booking) => booking.status === 'in-progress').length,
      completed: myBookings.filter((booking) => booking.status === 'completed').length,
      cancelled: myBookings.filter((booking) => booking.status === 'cancelled').length,
      paid: myBookings.filter((booking) => booking.paymentStatus === 'paid').length,
      totalSpent: Number(
        myPayments.reduce((sum, payment) => sum + payment.amount, 0).toFixed(2),
      ),
    };
    sendSuccess(res, { role: 'customer', counts, chart: monthlySeries(myBookings, (b) => b.createdAt) });
    return;
  }

  if (user.role === 'technician') {
    const services = await servicesCollection();
    const myServices = await services.find({ technicianEmail: email }).toArray();
    const myBookings = await bookings.find({ technicianEmail: email }).toArray();
    const payments = await paymentsCollection();
    const myPayments = await payments.find({ technicianEmail: email }).toArray();
    const counts = {
      totalServices: myServices.length,
      approvedServices: myServices.filter((service) => service.approvalStatus === 'approved').length,
      pendingServices: myServices.filter((service) => service.approvalStatus === 'pending').length,
      totalJobs: myBookings.length,
      requested: myBookings.filter((booking) => booking.status === 'requested').length,
      inProgress: myBookings.filter((booking) => booking.status === 'in-progress').length,
      completed: myBookings.filter((booking) => booking.status === 'completed').length,
      totalEarnings: Number(
        myPayments.reduce((sum, payment) => sum + payment.amount, 0).toFixed(2),
      ),
    };
    sendSuccess(res, { role: 'technician', counts, chart: monthlySeries(myBookings, (b) => b.createdAt) });
    return;
  }

  throw badRequest('Role-specific stats are only available for customers and technicians');
});

export const userSchemas = { profile: profileSchema };
