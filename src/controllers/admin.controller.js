import { z } from 'zod';
import { bookingsCollection, paymentsCollection, servicesCollection, usersCollection, } from '../config/db.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
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
const CHART_MONTHS = 6;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Both collections are valid account stores in this project: the Express API
// uses `users`, while BetterAuth (the Next.js client) uses `user`.
const accountProjection = {
    $project: {
        email: { $toLower: { $ifNull: ['$email', ''] } },
        role: { $ifNull: ['$role', ''] },
        createdAt: { $ifNull: ['$createdAt', null] },
    },
};
function chartStartDate() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (CHART_MONTHS - 1), 1));
}
function buildChart(userRows, bookingRows) {
    const usersByMonth = new Map(userRows.map((row) => [row._id, row.users]));
    const bookingsByMonth = new Map(bookingRows.map((row) => [row._id, row.bookings]));
    const now = new Date();
    return Array.from({ length: CHART_MONTHS }, (_, index) => {
        const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (CHART_MONTHS - 1 - index), 1));
        const key = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, '0')}`;
        return {
            label: MONTH_LABELS[month.getUTCMonth()],
            users: usersByMonth.get(key) ?? 0,
            bookings: bookingsByMonth.get(key) ?? 0,
        };
    });
}
export const getStats = asyncHandler(async (_req, res) => {
    const start = chartStartDate();
    const [accountTotals, monthlyUsers, monthlyBookings, pendingServices, totalBookings, revenueRows] = await Promise.all([
        (await usersCollection()).aggregate([
            accountProjection,
            { $unionWith: { coll: 'user', pipeline: [accountProjection] } },
            { $match: { email: { $ne: '' } } },
            { $group: { _id: '$email', role: { $first: '$role' } } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    technicians: { $sum: { $cond: [{ $eq: ['$role', 'technician'] }, 1, 0] } },
                },
            },
        ]).toArray(),
        (await usersCollection()).aggregate([
            accountProjection,
            { $unionWith: { coll: 'user', pipeline: [accountProjection] } },
            { $match: { email: { $ne: '' }, createdAt: { $gte: start } } },
            { $group: { _id: '$email', createdAt: { $min: '$createdAt' } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'UTC' } },
                    users: { $sum: 1 },
                },
            },
        ]).toArray(),
        (await bookingsCollection()).aggregate([
            { $match: { createdAt: { $gte: start } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'UTC' } },
                    bookings: { $sum: 1 },
                },
            },
        ]).toArray(),
        (await servicesCollection()).countDocuments({ approvalStatus: 'pending' }),
        (await bookingsCollection()).countDocuments({}),
        (await paymentsCollection()).aggregate([
            { $match: { paymentStatus: 'paid' } },
            { $group: { _id: null, total: { $sum: { $ifNull: ['$amount', 0] } } } },
        ]).toArray(),
    ]);
    sendSuccess(res, {
        totalUsers: accountTotals[0]?.total ?? 0,
        totalTechnicians: accountTotals[0]?.technicians ?? 0,
        pendingServices,
        totalBookings,
        totalRevenue: Number((revenueRows[0]?.total ?? 0).toFixed(2)),
        chart: buildChart(monthlyUsers, monthlyBookings),
    });
});
export const adminSchemas = {
    params: idParamSchema,
    role: roleSchema,
    approval: approvalSchema,
    listServices: listServicesSchema,
    listBookings: listBookingsSchema,
};
