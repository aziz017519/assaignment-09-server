import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { bookingsCollection, paymentsCollection, servicesCollection } from '../config/db.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { ACTIVE_BOOKING_STATUSES, assertStatusTransition, } from '../utils/statusRules.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { buildInvoicePdf, formatInvoiceDate, invoiceDateKey } from '../utils/invoice.js';
import { parseObjectId, toIdString } from '../utils/objectId.js';
import { hasRating, ratingSummary } from '../utils/ratings.js';
import { sendSuccess } from '../utils/response.js';
const idParamSchema = z.object({ id: z.string().min(1) });
function normalizeEmail(value) {
    return String(value ?? '').trim().toLowerCase();
}
function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export const createBookingSchema = z.object({
    serviceId: z.string().min(1),
    customerPhone: z
        .string()
        .trim()
        .regex(/^[0-9+\-()\s]{7,20}$/, 'Provide a valid phone number'),
    address: z.string().trim().min(10, 'Address must be at least 10 characters').max(300),
    preferredDate: z
        .string()
        .min(1, 'preferredDate is required')
        .refine((value) => /^\d{4}-\d{2}-\d{2}/.test(value), 'preferredDate must be a valid date')
        .refine((value) => {
            const [year, month, day] = value.slice(0, 10).split('-').map(Number);
            const parsed = new Date(year, month - 1, day);
            return parsed.getFullYear() === year &&
                parsed.getMonth() === month - 1 &&
                parsed.getDate() === day;
        }, 'preferredDate must be a valid date')
        .refine((value) => value.slice(0, 10) >= localDateKey(new Date()), 'preferredDate must be today or in the future')
        .transform((value) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`)),
    problemDescription: z.string().trim().min(10, 'Problem description must be at least 10 characters').max(2000),
});
export const listBookingsQuerySchema = z.object({
    status: z
        .enum(['requested', 'accepted', 'rejected', 'in-progress', 'completed', 'cancelled'])
        .optional(),
});
export const reviewSchema = z.object({
    rating: z.number().int().min(1).max(5),
    review: z.string().trim().max(500).optional(),
});
export const updateStatusSchema = z.object({
    status: z.enum(['requested', 'accepted', 'rejected', 'in-progress', 'completed', 'cancelled']),
    finalAmount: z.coerce.number().positive().optional(),
});
function historyEntry(status) {
    return { status, changedAt: new Date() };
}
function bookingIdOrNotFound(value) {
    if (typeof value !== 'string' || !ObjectId.isValid(value)) {
        throw notFound('Booking not found');
    }
    return new ObjectId(value);
}
async function ownedBooking(id, email, message) {
    const bookings = await bookingsCollection();
    const booking = await bookings.findOne({ _id: bookingIdOrNotFound(id) });
    if (!booking)
        throw notFound('Booking not found');
    if (String(booking.customerEmail ?? '').toLowerCase() !== email.toLowerCase()) {
        throw forbidden(message);
    }
    return { bookings, booking };
}
function assertPaid(booking, message) {
    if (booking.paymentStatus !== 'paid')
        throw badRequest(message);
}
function safeDate(value, fallback) {
    const date = value instanceof Date ? value : new Date(value ?? 0);
    return Number.isNaN(date.getTime()) ? fallback : date;
}
function invoiceNumberFor(bookingId, paidAt) {
    return `FM-${invoiceDateKey(paidAt)}-${toIdString(bookingId)?.slice(-6).toUpperCase() ?? 'BOOKING'}`;
}
function logAggregateFailure(bookingId, serviceId, error) {
    // Identifiers only: never log emails, tokens or payment identifiers.
    console.error('[fixmate:review] service rating aggregate update failed', {
        bookingId: toIdString(bookingId),
        serviceId: toIdString(serviceId),
        errorName: error instanceof Error ? error.name : 'UnknownError',
    });
}
async function fallbackServiceSummary(bookings, serviceId, rating) {
    try {
        const reviewed = await bookings
            .find({ serviceId, rating: { $exists: true } }, { projection: { rating: 1 } })
            .toArray();
        const ratingCount = reviewed.length || 1;
        const ratingSum = reviewed.reduce((total, item) => {
            const value = Number(item.rating);
            return total + (Number.isFinite(value) ? value : 0);
        }, 0) || rating;
        return {
            averageRating: Math.round((ratingSum / ratingCount) * 10) / 10,
            ratingCount,
        };
    }
    catch {
        // The review is already saved; a best-effort summary is still preferable
        // to failing the request because reporting could not be recomputed.
        return { averageRating: rating, ratingCount: 1 };
    }
}
export const createBooking = asyncHandler(async (req, res) => {
    const input = req.body;
    const customerEmail = req.user.email.toLowerCase();
    const services = await servicesCollection();
    const service = await services.findOne({ _id: parseObjectId(input.serviceId, 'service id') });
    if (!service || service.approvalStatus !== 'approved' || !service.isAvailable) {
        throw notFound('Service not found or not available');
    }
    const technicianEmail = normalizeEmail(service.technicianEmail);
    if (!technicianEmail) {
        throw notFound('Service technician is unavailable');
    }
    if (technicianEmail === customerEmail) {
        throw forbidden('You cannot book your own service');
    }
    const bookings = await bookingsCollection();
    const duplicate = await bookings.findOne({
        serviceId: service._id,
        customerEmail,
        status: { $in: [...ACTIVE_BOOKING_STATUSES] },
    });
    if (duplicate) {
        throw conflict('You already have an active request for this service');
    }
    const document = {
        _id: new ObjectId(),
        serviceId: service._id,
        serviceTitle: service.title,
        serviceImage: service.image,
        category: service.category,
        basePrice: service.basePrice,
        technicianName: service.technicianName,
        technicianEmail,
        customerName: req.dbUser?.name ?? req.user.name ?? '',
        customerEmail,
        customerPhone: input.customerPhone,
        address: input.address,
        preferredDate: input.preferredDate,
        problemDescription: input.problemDescription,
        status: 'requested',
        finalAmount: service.basePrice,
        paymentStatus: 'unpaid',
        statusHistory: [historyEntry('requested')],
        createdAt: new Date(),
    };
    const result = await bookings.insertOne(document);
    sendSuccess(res, { ...document, _id: result.insertedId }, 'Repair request sent', 201);
});
export const getMyBookings = asyncHandler(async (req, res) => {
    const { status } = req.query;
    const bookings = await bookingsCollection();
    const filter = { customerEmail: req.user.email.toLowerCase(), ...(status ? { status } : {}) };
    const data = await bookings.find(filter).sort({ createdAt: -1, _id: -1 }).toArray();
    sendSuccess(res, data.map((booking) => ({
        ...booking,
        rating: booking.rating ?? null,
        review: booking.review ?? null,
        reviewedAt: booking.reviewedAt ?? null,
        canReview: booking.paymentStatus === 'paid' && !hasRating(booking),
    })));
});

export const createBookingReview = asyncHandler(async (req, res) => {
    const { rating, review } = req.body;
    const { bookings, booking } = await ownedBooking(
        req.params.id,
        req.user.email.toLowerCase(),
        'You can only review your own bookings',
    );
    assertPaid(booking, 'Only paid bookings can be reviewed');
    if (hasRating(booking))
        throw conflict('This booking has already been reviewed');

    const reviewedAt = new Date();
    const result = await bookings.updateOne(
        {
            _id: booking._id,
            customerEmail: booking.customerEmail,
            paymentStatus: 'paid',
            rating: { $exists: false },
        },
        { $set: { rating, review: review ?? null, reviewedAt } },
    );
    if (result.matchedCount === 0)
        throw conflict('This booking has already been reviewed');

    const services = await servicesCollection();
    let serviceSummary;
    try {
        const aggregate = await services.updateOne(
            { _id: booking.serviceId },
            { $inc: { ratingSum: rating, ratingCount: 1 } },
        );
        if (!aggregate.matchedCount)
            throw new Error('Service aggregate target not found');
        serviceSummary = ratingSummary(await services.findOne({ _id: booking.serviceId }));
    }
    catch (error) {
        logAggregateFailure(booking._id, booking.serviceId, error);
        // The review stays saved even if reporting could not be updated.
        serviceSummary = await fallbackServiceSummary(bookings, booking.serviceId, rating);
    }

    sendSuccess(res, {
        rating,
        review: review ?? null,
        reviewedAt,
        service: serviceSummary,
    }, 'Review submitted', 201);
});

export const getBookingInvoice = asyncHandler(async (req, res) => {
    const { booking } = await ownedBooking(
        req.params.id,
        req.user.email.toLowerCase(),
        'You can only download invoices for your own bookings',
    );
    assertPaid(booking, 'Only paid bookings have an invoice');

    const payments = await paymentsCollection();
    const payment = await payments.findOne(
        { bookingId: booking._id },
        { projection: { paidAt: 1, createdAt: 1, currency: 1 } },
    );
    const issueDate = new Date();
    const paidDate = safeDate(
        payment?.paidAt ?? booking.paidAt ?? payment?.createdAt ?? booking.updatedAt ?? booking.createdAt,
        issueDate,
    );
    const invoiceNumber = invoiceNumberFor(booking._id, paidDate);
    const pdf = await buildInvoicePdf({
        invoiceNumber,
        issueDate: formatInvoiceDate(issueDate),
        paidDate: formatInvoiceDate(paidDate),
        bookingReference: booking.ticketId ?? `FM-${toIdString(booking._id)?.slice(-6).toUpperCase() ?? 'BOOKING'}`,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        technicianName: booking.technicianName,
        serviceTitle: booking.serviceTitle,
        category: booking.category,
        description: booking.problemDescription,
        amount: booking.finalAmount ?? booking.basePrice ?? 0,
        currency: payment?.currency ?? 'usd',
    });

    res
        .status(200)
        .set('Content-Type', 'application/pdf')
        .set('Content-Disposition', `attachment; filename="invoice-${invoiceNumber}.pdf"`)
        .set('Cache-Control', 'private, no-store')
        .send(pdf);
});

function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export const getBookingStats = asyncHandler(async (req, res) => {
    const customerEmail = req.user.email.toLowerCase();
    const bookings = await bookingsCollection();
    const data = await bookings.find({ customerEmail }).sort({ createdAt: -1 }).toArray();

    const totalRequests = data.length;
    const activeJobs = data.filter((booking) => ACTIVE_BOOKING_STATUSES.includes(booking.status)).length;
    const completedJobs = data.filter((booking) => booking.status === 'completed').length;

    const countsByDay = new Map();
    for (const booking of data) {
        const created = booking.createdAt instanceof Date ? booking.createdAt : new Date(booking.createdAt ?? 0);
        if (Number.isNaN(created.getTime()))
            continue;
        const key = localDateKey(created);
        countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activity = [];
    for (let offset = 6; offset >= 0; offset--) {
        const day = new Date(today);
        day.setDate(today.getDate() - offset);
        activity.push({
            label: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            count: countsByDay.get(localDateKey(day)) ?? 0,
        });
    }

    sendSuccess(res, { totalRequests, activeJobs, completedJobs, activity });
});

export const getTechnicianBookings = asyncHandler(async (req, res) => {
    const { status } = req.query;
    const email = normalizeEmail(req.user.email);
    const bookings = await bookingsCollection();
    // Anchored and escaped so legacy mixed-case rows remain visible without
    // turning dots or plus signs in an email into regex wildcards.
    const filter = {
        technicianEmail: { $regex: `^${escapeRegExp(email)}$`, $options: 'i' },
        ...(status ? { status } : {}),
    };
    const data = await bookings.find(filter).sort({ createdAt: -1, _id: -1 }).toArray();
    sendSuccess(res, data);
});
export const updateBookingStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, finalAmount } = req.body;
    const email = normalizeEmail(req.user.email);
    const bookings = await bookingsCollection();
    const booking = await bookings.findOne({ _id: parseObjectId(id, 'booking id') });
    if (!booking)
        throw notFound('Booking not found');
    if (normalizeEmail(booking.technicianEmail) !== email) {
        throw forbidden('You can only update your own bookings');
    }
    const transition = assertStatusTransition(booking.status, status, 'technician');
    const set = { status, technicianEmail: email };
    if (transition.requiresFinalAmount) {
        if (typeof finalAmount !== 'number' || !Number.isFinite(finalAmount) || finalAmount <= 0) {
            throw badRequest('finalAmount greater than 0 is required to complete a job');
        }
        set.finalAmount = finalAmount;
    }
    const result = await bookings.updateOne({ _id: booking._id, status: booking.status, technicianEmail: booking.technicianEmail }, { $set: set, $push: { statusHistory: historyEntry(status) } });
    if (result.matchedCount === 0)
        throw conflict('Booking was updated by another user, refresh and retry');
    const updated = await bookings.findOne({ _id: booking._id });
    sendSuccess(res, updated, `Booking marked as ${status}`);
});
export const cancelBooking = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const email = req.user.email.toLowerCase();
    const bookings = await bookingsCollection();
    const booking = await bookings.findOne({ _id: parseObjectId(id, 'booking id') });
    if (!booking)
        throw notFound('Booking not found');
    if (booking.customerEmail.toLowerCase() !== email) {
        throw forbidden('You can only cancel your own bookings');
    }
    if (booking.status !== 'requested') {
        throw badRequest('Only a requested booking can be cancelled');
    }
    const result = await bookings.updateOne({ _id: booking._id, customerEmail: booking.customerEmail, status: 'requested' }, { $set: { status: 'cancelled' }, $push: { statusHistory: historyEntry('cancelled') } });
    if (result.matchedCount === 0)
        throw conflict('Booking was updated, refresh and retry');
    const updated = await bookings.findOne({ _id: booking._id });
    sendSuccess(res, updated, 'Booking cancelled');
});
export const bookingSchemas = {
    create: createBookingSchema,
    list: listBookingsQuerySchema,
    review: reviewSchema,
    updateStatus: updateStatusSchema,
    params: idParamSchema,
};
