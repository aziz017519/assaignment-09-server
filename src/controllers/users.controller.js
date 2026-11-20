import { hashPassword } from '@better-auth/utils/password';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { accountsCollection, bookingsCollection, paymentsCollection, servicesCollection, usersCollection, } from '../config/db.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { findUserByEmail } from '../services/user.service.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { normalizeSignupRole } from '../utils/roles.js';
import { publicUser } from '../utils/sanitize.js';
import { sendSuccess } from '../utils/response.js';
// Legacy payments have no `type`; they are all booking payments.
const bookingPaymentFilter = { $or: [{ type: 'booking' }, { type: { $exists: false } }] };
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
const signupSchema = z.object({
    name: z.string().trim().min(2).max(80),
    email: z.email(),
    password: z.string().min(8).max(128),
    role: z.string().optional(),
});
export const signup = asyncHandler(async (req, res) => {
    const input = req.body;
    const email = input.email.trim().toLowerCase();
    if (await findUserByEmail(email))
        throw conflict('An account with this email already exists');
    const role = normalizeSignupRole(input.role);
    const now = new Date();
    const userId = new ObjectId();
    const user = {
        _id: userId,
        name: input.name,
        email,
        role,
        emailVerified: false,
        plan: 'free',
        createdAt: now,
        updatedAt: now,
    };
    const users = await usersCollection();
    const accounts = await accountsCollection();
    const hashedPassword = await hashPassword(input.password);
    try {
        await users.insertOne(user);
        await accounts.insertOne({
            _id: new ObjectId(),
            userId: userId.toHexString(),
            accountId: userId.toHexString(),
            providerId: 'credential',
            password: hashedPassword,
            createdAt: now,
            updatedAt: now,
        });
    }
    catch (error) {
        if (typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 11000) {
            throw conflict('An account with this email already exists');
        }
        throw error;
    }
    sendSuccess(res, publicUser(user), 'Account created', 201);
});
export const getMe = asyncHandler(async (req, res) => {
    const user = await findUserByEmail(req.user.email);
    if (!user)
        throw notFound('User not found');
    sendSuccess(res, publicUser(user));
});
export const updateProfile = asyncHandler(async (req, res) => {
    const input = req.body;
    const users = await usersCollection();
    const result = await users.findOneAndUpdate({ email: req.user.email.toLowerCase() }, { $set: { ...input, updatedAt: new Date() } }, { returnDocument: 'after' });
    if (!result)
        throw notFound('User not found');
    sendSuccess(res, publicUser(result), 'Profile updated');
});
function lastSixMonths() {
    const months = [];
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
function monthlySeries(items, dateOf) {
    const buckets = lastSixMonths();
    const counts = new Map(buckets.map((bucket) => [bucket.key, 0]));
    for (const item of items) {
        const date = dateOf(item);
        if (!date)
            continue;
        const key = date.toISOString().slice(0, 7);
        if (counts.has(key))
            counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return buckets.map((bucket) => ({ label: bucket.label, count: counts.get(bucket.key) ?? 0 }));
}
export const getRoleStats = asyncHandler(async (req, res) => {
    const email = req.user.email.toLowerCase();
    const user = await findUserByEmail(email);
    if (!user)
        throw notFound('User not found');
    const bookings = await bookingsCollection();
    if (user.role === 'customer') {
        const myBookings = await bookings.find({ customerEmail: email }).toArray();
        const payments = await paymentsCollection();
        const myPayments = await payments.find({ customerEmail: email, ...bookingPaymentFilter }).toArray();
        const counts = {
            totalRequests: myBookings.length,
            requested: myBookings.filter((booking) => booking.status === 'requested').length,
            accepted: myBookings.filter((booking) => booking.status === 'accepted').length,
            inProgress: myBookings.filter((booking) => booking.status === 'in-progress').length,
            completed: myBookings.filter((booking) => booking.status === 'completed').length,
            cancelled: myBookings.filter((booking) => booking.status === 'cancelled').length,
            paid: myBookings.filter((booking) => booking.paymentStatus === 'paid').length,
            totalSpent: Number(myPayments.reduce((sum, payment) => sum + payment.amount, 0).toFixed(2)),
        };
        sendSuccess(res, { role: 'customer', counts, chart: monthlySeries(myBookings, (b) => b.createdAt) });
        return;
    }
    if (user.role === 'technician') {
        const services = await servicesCollection();
        const myServices = await services.find({ technicianEmail: email }).toArray();
        const myBookings = await bookings.find({ technicianEmail: email }).toArray();
        const payments = await paymentsCollection();
        const myPayments = await payments.find({ technicianEmail: email, ...bookingPaymentFilter }).toArray();
        const counts = {
            totalServices: myServices.length,
            approvedServices: myServices.filter((service) => service.approvalStatus === 'approved').length,
            pendingServices: myServices.filter((service) => service.approvalStatus === 'pending').length,
            totalJobs: myBookings.length,
            requested: myBookings.filter((booking) => booking.status === 'requested').length,
            inProgress: myBookings.filter((booking) => booking.status === 'in-progress').length,
            completed: myBookings.filter((booking) => booking.status === 'completed').length,
            totalEarnings: Number(myPayments.reduce((sum, payment) => sum + payment.amount, 0).toFixed(2)),
        };
        sendSuccess(res, { role: 'technician', counts, chart: monthlySeries(myBookings, (b) => b.createdAt) });
        return;
    }
    throw badRequest('Role-specific stats are only available for customers and technicians');
});
export const userSchemas = { profile: profileSchema, signup: signupSchema };
