import { z } from 'zod';
import { bookingsCollection, paymentsCollection, servicesCollection, usersCollection, } from '../config/db.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { BOOKING_STATUSES } from '../utils/constants.js';
import { forbidden, notFound } from '../utils/errors.js';
import { parseObjectId } from '../utils/objectId.js';
import { publicUser } from '../utils/sanitize.js';
import { sendSuccess } from '../utils/response.js';
const idParamSchema = z.object({ id: z.string().min(1) });
const roleSchema = z.object({
    role: z.enum(['customer', 'technician', 'admin']),
});
const approvalSchema = z.object({ approvalStatus: z.enum(['approved', 'rejected']) });
const listServicesSchema = z.object({
    approvalStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
});
const listBookingsSchema = z.object({
    status: z
        .enum(['requested', 'accepted', 'rejected', 'in-progress', 'completed', 'cancelled'])
        .optional(),
});
export const getUsers = asyncHandler(async (_req, res) => {
    const users = await usersCollection();
    const data = await users.find().sort({ createdAt: -1 }).toArray();
    sendSuccess(res, data.map(publicUser));
});
export const updateUserRole = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;
    const users = await usersCollection();
    const target = await users.findOne({ _id: parseObjectId(id, 'user id') });
    if (!target)
        throw notFound('User not found');
    if (target.email.toLowerCase() === req.user.email.toLowerCase()) {
        throw forbidden('You cannot change your own role');
    }
    await users.updateOne({ _id: target._id }, { $set: { role, updatedAt: new Date() } });
    const updated = await users.findOne({ _id: target._id });
    sendSuccess(res, updated ? publicUser(updated) : null, 'User role updated');
});
export const getServices = asyncHandler(async (req, res) => {
    const { approvalStatus } = req.query;
    const services = await servicesCollection();
    const filter = approvalStatus ? { approvalStatus } : {};
    const data = await services.find(filter).sort({ createdAt: -1 }).toArray();
    sendSuccess(res, data);
});
export const updateServiceApproval = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { approvalStatus } = req.body;
    const services = await servicesCollection();
    const objectId = parseObjectId(id, 'service id');
    const result = await services.updateOne({ _id: objectId }, { $set: { approvalStatus } });
    if (result.matchedCount === 0)
        throw notFound('Service not found');
    const updated = await services.findOne({ _id: objectId });
    sendSuccess(res, updated, 'Service approval updated');
});
export const getBookings = asyncHandler(async (req, res) => {
    const { status } = req.query;
    const bookings = await bookingsCollection();
    const filter = status ? { status } : {};
    const data = await bookings.find(filter).sort({ createdAt: -1 }).toArray();
    sendSuccess(res, data);
});
export const getPayments = asyncHandler(async (_req, res) => {
    const payments = await paymentsCollection();
    const data = await payments.find().sort({ paidAt: -1 }).toArray();
    const totalRevenue = Number(data.reduce((sum, payment) => sum + payment.amount, 0).toFixed(2));
    sendSuccess(res, { data, totalRevenue });
});
export const getStats = asyncHandler(async (_req, res) => {
    const [users, services, bookings, payments] = await Promise.all([
        usersCollection(),
        servicesCollection(),
        bookingsCollection(),
        paymentsCollection(),
    ]);
    const [allUsers, allServices, allBookings, allPayments] = await Promise.all([
        users.find().toArray(),
        services.find().toArray(),
        bookings.find().toArray(),
        payments.find().toArray(),
    ]);
    const bookingsByStatus = Object.fromEntries(BOOKING_STATUSES.map((status) => [
        status,
        allBookings.filter((booking) => booking.status === status).length,
    ]));
    sendSuccess(res, {
        users: {
            total: allUsers.length,
            customers: allUsers.filter((user) => user.role === 'customer').length,
            technicians: allUsers.filter((user) => user.role === 'technician').length,
        },
        services: {
            total: allServices.length,
            pending: allServices.filter((service) => service.approvalStatus === 'pending').length,
            approved: allServices.filter((service) => service.approvalStatus === 'approved').length,
            rejected: allServices.filter((service) => service.approvalStatus === 'rejected').length,
        },
        bookings: { total: allBookings.length, byStatus: bookingsByStatus },
        payments: {
            total: allPayments.length,
            revenue: Number(allPayments.reduce((sum, payment) => sum + payment.amount, 0).toFixed(2)),
        },
    });
});
export const adminSchemas = {
    params: idParamSchema,
    role: roleSchema,
    approval: approvalSchema,
    listServices: listServicesSchema,
    listBookings: listBookingsSchema,
};
