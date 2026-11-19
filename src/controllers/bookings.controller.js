import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { bookingsCollection, servicesCollection } from '../config/db.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { ACTIVE_BOOKING_STATUSES, assertStatusTransition, } from '../utils/statusRules.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { parseObjectId } from '../utils/objectId.js';
import { sendSuccess } from '../utils/response.js';
const idParamSchema = z.object({ id: z.string().min(1) });
export const createBookingSchema = z.object({
    serviceId: z.string().min(1),
    customerPhone: z
        .string()
        .trim()
        .regex(/^[0-9+\-()\s]{7,20}$/, 'Provide a valid phone number'),
    address: z.string().trim().min(5).max(300),
    preferredDate: z.coerce.date(),
    problemDescription: z.string().trim().min(20).max(2000),
});
export const listBookingsQuerySchema = z.object({
    status: z
        .enum(['requested', 'accepted', 'rejected', 'in-progress', 'completed', 'cancelled'])
        .optional(),
});
export const updateStatusSchema = z.object({
    status: z.enum(['requested', 'accepted', 'rejected', 'in-progress', 'completed', 'cancelled']),
    finalAmount: z.coerce.number().positive().optional(),
});
function startOfToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
}
function historyEntry(status) {
    return { status, changedAt: new Date() };
}
export const createBooking = asyncHandler(async (req, res) => {
    const input = req.body;
    const customerEmail = req.user.email.toLowerCase();
    if (input.preferredDate < startOfToday()) {
        throw badRequest('preferredDate must be today or in the future');
    }
    const services = await servicesCollection();
    const service = await services.findOne({ _id: parseObjectId(input.serviceId, 'service id') });
    if (!service || service.approvalStatus !== 'approved' || !service.isAvailable) {
        throw notFound('Service not found or not available');
    }
    if (service.technicianEmail.toLowerCase() === customerEmail) {
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
        technicianEmail: service.technicianEmail,
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
    sendSuccess(res, data);
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
    const bookings = await bookingsCollection();
    const filter = { technicianEmail: req.user.email.toLowerCase(), ...(status ? { status } : {}) };
    const data = await bookings.find(filter).sort({ createdAt: -1, _id: -1 }).toArray();
    sendSuccess(res, data);
});
export const updateBookingStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, finalAmount } = req.body;
    const email = req.user.email.toLowerCase();
    const bookings = await bookingsCollection();
    const booking = await bookings.findOne({ _id: parseObjectId(id, 'booking id') });
    if (!booking)
        throw notFound('Booking not found');
    if (booking.technicianEmail.toLowerCase() !== email) {
        throw forbidden('You can only update your own bookings');
    }
    const transition = assertStatusTransition(booking.status, status, 'technician');
    const set = { status };
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
    updateStatus: updateStatusSchema,
    params: idParamSchema,
};
