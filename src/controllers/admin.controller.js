import { z } from 'zod';
import { bookingsCollection, COLLECTIONS, paymentsCollection, servicesCollection, usersCollection, } from '../config/db.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { findUserStoreById } from '../services/user.service.js';
import { APPROVAL_STATUSES, BOOKING_STATUSES, SERVICE_CATEGORIES, USER_ROLES } from '../utils/constants.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { parseObjectId, toIdString } from '../utils/objectId.js';
import { publicUser } from '../utils/sanitize.js';
import { escapeRegex } from '../utils/search.js';
import { sendSuccess } from '../utils/response.js';
import { findTransition } from '../utils/statusRules.js';
const idParamSchema = z.object({ id: z.string().min(1) });
const roleSchema = z.object({ role: z.enum(USER_ROLES) });
const approvalSchema = z.object({ approvalStatus: z.enum(['approved', 'rejected']) });
const serviceStatusSchema = z.object({ status: z.enum(APPROVAL_STATUSES) });
const bookingStatusSchema = z.object({
    status: z.enum(BOOKING_STATUSES),
    finalAmount: z.coerce.number().positive().optional(),
});
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine(
    (value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)),
    'Invalid date'
);
const listUsersSchema = z.object({
    search: z.string().trim().max(100).optional(),
    role: z.enum(USER_ROLES).optional(),
    status: z.enum(['verified', 'unverified']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    sort: z.enum(['newest', 'oldest', 'name_asc', 'name_desc', 'role_asc']).default('newest'),
});
const listServicesSchema = z.object({
    search: z.string().trim().max(100).optional(),
    status: z.enum(APPROVAL_STATUSES).optional(),
    // Kept for backwards compatibility with the previous admin endpoint.
    approvalStatus: z.enum(APPROVAL_STATUSES).optional(),
    category: z.enum(SERVICE_CATEGORIES).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    sort: z.enum(['newest', 'oldest', 'price_asc', 'price_desc', 'title_asc']).default('newest'),
});
const listBookingsSchema = z.object({
    search: z.string().trim().max(100).optional(),
    status: z.enum(BOOKING_STATUSES).optional(),
    from: dateString.optional(),
    to: dateString.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    sort: z.enum(['newest', 'oldest', 'date_asc', 'date_desc', 'price_asc', 'price_desc']).default('newest'),
});
const listTransactionsSchema = z.object({
    search: z.string().trim().max(100).optional(),
    status: z.enum(['paid', 'unpaid', 'pending', 'failed', 'refunded']).optional(),
    // Payments have no `method` field; this real field is `type` (booking|subscription).
    method: z.enum(['booking', 'subscription']).optional(),
    type: z.enum(['booking', 'subscription']).optional(),
    from: dateString.optional(),
    to: dateString.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    sort: z.enum(['newest', 'oldest', 'amount_asc', 'amount_desc']).default('newest'),
});
function textFilter(value, fields) {
    if (!value) return {};
    const regex = new RegExp(escapeRegex(value), 'i');
    return { $or: fields.map((field) => ({ [field]: regex })) };
}
function dateRangeFilter(from, to, field = 'createdAt') {
    if (!from && !to) return {};
    const range = {};
    if (from) range.$gte = new Date(`${from}T00:00:00.000Z`);
    if (to) range.$lte = new Date(`${to}T23:59:59.999Z`);
    return { [field]: range };
}
function paginationMeta(total, page, limit) {
    return { total, page, limit, totalPages: Math.ceil(total / limit) };
}
function publicService(service) {
    const status = service.approvalStatus ?? 'pending';
    return {
        id: toIdString(service._id),
        title: service.title ?? '',
        category: service.category ?? null,
        technicianName: service.technicianName ?? null,
        technicianEmail: service.technicianEmail ?? null,
        price: Number(service.basePrice ?? 0),
        status,
        approvalStatus: status,
        isAvailable: Boolean(service.isAvailable),
        image: service.image ?? null,
        createdAt: service.createdAt ?? null,
    };
}
function servicesSort(sort) {
    if (sort === 'oldest') return { createdAt: 1, _id: 1 };
    if (sort === 'price_asc') return { basePrice: 1, _id: 1 };
    if (sort === 'price_desc') return { basePrice: -1, _id: 1 };
    if (sort === 'title_asc') return { title: 1, _id: 1 };
    return { createdAt: -1, _id: -1 };
}
function publicBooking(booking) {
    const id = toIdString(booking._id);
    return {
        id,
        ticketId: booking.ticketId ?? id,
        customerName: booking.customerName ?? '',
        customerEmail: booking.customerEmail ?? null,
        technicianName: booking.technicianName ?? null,
        technicianEmail: booking.technicianEmail ?? null,
        serviceTitle: booking.serviceTitle ?? '',
        category: booking.category ?? null,
        status: booking.status ?? 'requested',
        preferredDate: booking.preferredDate ?? null,
        price: Number(booking.finalAmount ?? booking.basePrice ?? 0),
        basePrice: Number(booking.basePrice ?? 0),
        paymentStatus: booking.paymentStatus ?? null,
        createdAt: booking.createdAt ?? null,
    };
}
function bookingsSort(sort) {
    if (sort === 'oldest') return { createdAt: 1, _id: 1 };
    if (sort === 'date_asc') return { preferredDate: 1, _id: 1 };
    if (sort === 'date_desc') return { preferredDate: -1, _id: 1 };
    if (sort === 'price_asc') return { finalAmount: 1, _id: 1 };
    if (sort === 'price_desc') return { finalAmount: -1, _id: 1 };
    return { createdAt: -1, _id: -1 };
}
// Accounts live in both the legacy Express `users` collection and BetterAuth's
// `user` collection. Union, dedupe by lowercased email, then paginate in MongoDB.
const accountDocuments = {
    $project: {
        emailKey: { $toLower: { $ifNull: ['$email', ''] } },
        doc: '$$ROOT',
    },
};
function usersSort(sort) {
    if (sort === 'oldest') return { createdAt: 1, _id: 1 };
    if (sort === 'name_asc') return { name: 1, _id: 1 };
    if (sort === 'name_desc') return { name: -1, _id: 1 };
    if (sort === 'role_asc') return { role: 1, name: 1, _id: 1 };
    return { createdAt: -1, _id: -1 };
}
export const getUsers = asyncHandler(async (req, res) => {
    const { search, role, status, page, limit, sort } = req.query;
    const filter = { ...textFilter(search, ['name', 'email', 'phone']) };
    if (role) filter.role = role;
    if (status) filter.emailVerified = status === 'verified';
    const [result] = await (await usersCollection()).aggregate([
        accountDocuments,
        { $unionWith: { coll: COLLECTIONS.user, pipeline: [accountDocuments] } },
        { $match: { emailKey: { $ne: '' } } },
        { $group: { _id: '$emailKey', doc: { $first: '$doc' } } },
        { $replaceRoot: { newRoot: '$doc' } },
        { $match: filter },
        { $sort: usersSort(sort) },
        {
            $facet: {
                items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
                total: [{ $count: 'count' }],
            },
        },
    ]).toArray();
    const total = result?.total?.[0]?.count ?? 0;
    sendSuccess(
        res,
        (result?.items ?? []).map(publicUser),
        undefined,
        200,
        paginationMeta(total, page, limit)
    );
});
export const updateUserRole = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;
    const store = await findUserStoreById(id);
    if (!store)
        throw notFound('User not found');
    if (store.user.email?.toLowerCase() === req.user.email.toLowerCase())
        throw forbidden('You cannot change your own role');
    await store.collection.updateOne(
        { _id: store.user._id },
        { $set: { role, updatedAt: new Date() } }
    );
    const updated = await store.collection.findOne({ _id: store.user._id });
    sendSuccess(res, publicUser(updated), 'User role updated');
});
export const getServices = asyncHandler(async (req, res) => {
    const { search, status, approvalStatus, category, page, limit, sort } = req.query;
    const filter = {
        ...textFilter(search, ['title', 'technicianName', 'technicianEmail', 'category', 'description']),
    };
    const statusFilter = status ?? approvalStatus;
    if (statusFilter) filter.approvalStatus = statusFilter;
    if (category) filter.category = category;
    const [result] = await (await servicesCollection()).aggregate([
        { $match: filter },
        { $sort: servicesSort(sort) },
        {
            $facet: {
                items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
                total: [{ $count: 'count' }],
            },
        },
    ]).toArray();
    const total = result?.total?.[0]?.count ?? 0;
    sendSuccess(
        res,
        (result?.items ?? []).map(publicService),
        undefined,
        200,
        paginationMeta(total, page, limit)
    );
});
async function setServiceStatus(res, id, status, message) {
    const services = await servicesCollection();
    const objectId = parseObjectId(id, 'service id');
    const result = await services.updateOne(
        { _id: objectId },
        { $set: { approvalStatus: status, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0)
        throw notFound('Service not found');
    const updated = await services.findOne({ _id: objectId });
    return sendSuccess(res, publicService(updated), message);
}
export const updateServiceStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    return setServiceStatus(res, id, status, 'Service status updated');
});
export const updateServiceApproval = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { approvalStatus } = req.body;
    return setServiceStatus(res, id, approvalStatus, 'Service approval updated');
});
export const deleteService = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const services = await servicesCollection();
    const objectId = parseObjectId(id, 'service id');
    const result = await services.deleteOne({ _id: objectId });
    if (result.deletedCount === 0)
        throw notFound('Service not found');
    sendSuccess(res, { id: toIdString(objectId) }, 'Service deleted');
});
export const getBookings = asyncHandler(async (req, res) => {
    const { search, status, from, to, page, limit, sort } = req.query;
    const filter = {
        ...textFilter(search, ['customerName', 'customerEmail', 'technicianName', 'serviceTitle']),
        ...dateRangeFilter(from, to, 'preferredDate'),
    };
    if (status) filter.status = status;
    const [result] = await (await bookingsCollection()).aggregate([
        { $match: filter },
        { $sort: bookingsSort(sort) },
        {
            $facet: {
                items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
                total: [{ $count: 'count' }],
            },
        },
    ]).toArray();
    const total = result?.total?.[0]?.count ?? 0;
    sendSuccess(
        res,
        (result?.items ?? []).map(publicBooking),
        undefined,
        200,
        paginationMeta(total, page, limit)
    );
});
export const updateBookingStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, finalAmount } = req.body;
    const bookings = await bookingsCollection();
    const booking = await bookings.findOne({ _id: parseObjectId(id, 'booking id') });
    if (!booking)
        throw notFound('Booking not found');
    // Admins may apply any legal transition, regardless of the normal actor.
    const transition = findTransition(booking.status, status);
    if (!transition)
        throw badRequest(`Invalid status transition: ${booking.status} -> ${status}`);
    const set = { status };
    if (transition.requiresFinalAmount) {
        if (typeof finalAmount !== 'number' || !Number.isFinite(finalAmount) || finalAmount <= 0) {
            throw badRequest('finalAmount greater than 0 is required to complete a job');
        }
        set.finalAmount = finalAmount;
    }
    const result = await bookings.updateOne(
        { _id: booking._id, status: booking.status },
        {
            $set: set,
            $push: { statusHistory: { status, changedAt: new Date() } },
        }
    );
    if (result.matchedCount === 0)
        throw conflict('Booking was updated by another user, refresh and retry');
    const updated = await bookings.findOne({ _id: booking._id });
    sendSuccess(res, publicBooking(updated), `Booking marked as ${status}`);
});
export const getPayments = asyncHandler(async (_req, res) => {
    const payments = await paymentsCollection();
    const data = await payments.find().sort({ paidAt: -1 }).toArray();
    const totalRevenue = Number(data.reduce((sum, payment) => sum + payment.amount, 0).toFixed(2));
    sendSuccess(res, { data, totalRevenue });
});
function publicTransaction(payment) {
    const status = payment.paymentStatus ?? payment.status ?? null;
    const date = payment.paidAt ?? payment.createdAt ?? null;
    return {
        id: toIdString(payment._id),
        transactionId: payment.transactionId ?? null,
        customerName: payment.customerName ?? null,
        customerEmail: payment.customerEmail ?? null,
        bookingId: toIdString(payment.bookingId) ?? null,
        serviceTitle: payment.serviceTitle ?? null,
        // Payments have no `method` field. `type` is the real discriminator.
        type: payment.type === 'subscription' ? 'subscription' : 'booking',
        amount: Number(payment.amount ?? 0),
        currency: payment.currency ?? 'usd',
        status,
        date,
        createdAt: payment.createdAt ?? null,
        receiptUrl: payment.receiptUrl ?? null,
    };
}
function transactionsSort(sort) {
    if (sort === 'oldest') return { dateValue: 1, _id: 1 };
    if (sort === 'amount_asc') return { amount: 1, _id: 1 };
    if (sort === 'amount_desc') return { amount: -1, _id: 1 };
    return { dateValue: -1, _id: -1 };
}
export const getTransactions = asyncHandler(async (req, res) => {
    const { search, status, method, type, from, to, page, limit, sort } = req.query;
    const clauses = [];
    const text = textFilter(search, ['customerName', 'customerEmail', 'transactionId', 'serviceTitle', 'type']);
    if (text.$or) clauses.push(text);
    if (status) clauses.push({ paymentStatus: status });
    const typeFilter = method ?? type;
    if (typeFilter) clauses.push({ type: typeFilter });
    const range = dateRangeFilter(from, to, 'dateValue');
    if (Object.keys(range).length) clauses.push(range);
    const filter = clauses.length === 1 ? clauses[0] : clauses.length ? { $and: clauses } : {};
    const payments = await paymentsCollection();
    const [resultRows, summaryRows] = await Promise.all([
        payments.aggregate([
            { $addFields: { dateValue: { $ifNull: ['$paidAt', '$createdAt'] } } },
            { $match: filter },
            { $sort: transactionsSort(sort) },
            {
                $facet: {
                    items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
                    total: [{ $count: 'count' }],
                },
            },
        ]).toArray(),
        payments.aggregate([
            {
                $group: {
                    _id: null,
                    totalRevenue: {
                        $sum: {
                            $cond: [
                                { $eq: ['$paymentStatus', 'paid'] },
                                { $ifNull: ['$amount', 0] },
                                0,
                            ],
                        },
                    },
                    successful: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] } },
                    pending: {
                        $sum: { $cond: [{ $in: ['$paymentStatus', ['unpaid', 'pending']] }, 1, 0] },
                    },
                    failed: {
                        $sum: { $cond: [{ $in: ['$paymentStatus', ['failed', 'refunded']] }, 1, 0] },
                    },
                },
            },
        ]).toArray(),
    ]);
    const result = resultRows[0] ?? {};
    const total = result.total?.[0]?.count ?? 0;
    const summary = {
        totalRevenue: Number((summaryRows[0]?.totalRevenue ?? 0).toFixed(2)),
        successful: summaryRows[0]?.successful ?? 0,
        pending: summaryRows[0]?.pending ?? 0,
        failed: summaryRows[0]?.failed ?? 0,
    };
    sendSuccess(
        res,
        (result.items ?? []).map(publicTransaction),
        undefined,
        200,
        { ...paginationMeta(total, page, limit), summary }
    );
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
    serviceStatus: serviceStatusSchema,
    bookingStatus: bookingStatusSchema,
    listUsers: listUsersSchema,
    listServices: listServicesSchema,
    listBookings: listBookingsSchema,
    listTransactions: listTransactionsSchema,
};
