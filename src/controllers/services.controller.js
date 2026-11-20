import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { servicesCollection } from '../config/db.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { FREE_SERVICE_LIMIT, normalizePlan } from '../services/subscription.service.js';
import { forbidden, notFound, planLimitReached } from '../utils/errors.js';
import { parseObjectId } from '../utils/objectId.js';
import { sendSuccess } from '../utils/response.js';
import { escapeRegex } from '../utils/search.js';
import { findUserByEmail } from '../services/user.service.js';
const categorySchema = z.enum([
    'Smartphone',
    'Laptop & PC',
    'AC',
    'Refrigerator',
    'TV',
    'Washing Machine',
    'Electrical',
]);
const serviceModeSchema = z.enum(['Home Visit', 'Shop Drop-off']);
export const listServicesQuerySchema = z.object({
    search: z.string().trim().max(100).optional(),
    category: categorySchema.optional(),
    serviceMode: serviceModeSchema.optional(),
    sort: z.enum(['price_asc', 'price_desc', 'newest']).default('newest'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
});
const createServiceSchema = z.object({
    title: z.string().trim().min(3).max(120),
    category: categorySchema,
    description: z.string().trim().min(10).max(2000),
    image: z.string().trim().min(1),
    basePrice: z.coerce.number().positive().max(1_000_000),
    estimatedDuration: z.string().trim().min(1).max(60),
    serviceMode: serviceModeSchema,
    serviceArea: z.string().trim().min(2).max(120),
});
const updateServiceSchema = createServiceSchema.partial().refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });
const availabilitySchema = z.object({ isAvailable: z.boolean() });
const idParamSchema = z.object({ id: z.string().min(1) });
function publicFilter() {
    return { approvalStatus: 'approved', isAvailable: true };
}
function assertOwner(service, email) {
    if (service.technicianEmail.toLowerCase() !== email.toLowerCase()) {
        throw forbidden('You can only modify your own services');
    }
}
export const listServices = asyncHandler(async (req, res) => {
    const { search, category, serviceMode, sort, page, limit } = req.query;
    const filter = { ...publicFilter() };
    if (search) {
        const pattern = new RegExp(escapeRegex(search), 'i');
        filter.$or = [{ title: { $regex: pattern } }, { category: { $regex: pattern } }];
    }
    if (category)
        filter.category = category;
    if (serviceMode)
        filter.serviceMode = serviceMode;
    const sortSpec = sort === 'price_asc'
        ? { basePrice: 1, _id: 1 }
        : sort === 'price_desc'
            ? { basePrice: -1, _id: 1 }
            : { createdAt: -1, _id: 1 };
    const services = await servicesCollection();
    const [data, total] = await Promise.all([
        services
            .find(filter)
            .sort(sortSpec)
            .skip((page - 1) * limit)
            .limit(limit)
            .toArray(),
        services.countDocuments(filter),
    ]);
    sendSuccess(res, {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    });
});
function technicianFromUser(user, service) {
    if (!user)
        return null;
    return {
        _id: user._id,
        name: user.name,
        email: user.email,
        image: user.image ?? null,
        area: user.area ?? service.serviceArea,
        bio: user.bio,
    };
}
export const getServiceById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const services = await servicesCollection();
    const service = await services.findOne({ _id: parseObjectId(id, 'service id'), ...publicFilter() });
    if (!service)
        throw notFound('Service not found');
    // MongoDB has no join; attach the technician account so the details page
    // can show name, avatar and area even for services without a nested copy.
    if (service.technicianEmail) {
        const user = await findUserByEmail(service.technicianEmail);
        if (user)
            service.technician = technicianFromUser(user, service);
    }
    sendSuccess(res, service);
});
export const getMyServices = asyncHandler(async (req, res) => {
    const email = req.user.email;
    const services = await servicesCollection();
    const data = await services
        .find({ technicianEmail: email.toLowerCase() })
        .sort({ createdAt: -1 })
        .toArray();
    sendSuccess(res, data);
});
export const createService = asyncHandler(async (req, res) => {
    const input = req.body;
    const email = req.user.email.toLowerCase();
    const services = await servicesCollection();
    // The plan is re-read from the database by verifyTechnician, never from the
    // client. Pro technicians are unlimited; free technicians stop at 3.
    if (normalizePlan(req.dbUser) !== 'pro') {
        const serviceCount = await services.countDocuments({ technicianEmail: email });
        if (serviceCount >= FREE_SERVICE_LIMIT)
            throw planLimitReached();
    }
    const document = {
        _id: new ObjectId(),
        ...input,
        technicianName: req.dbUser?.name ?? req.user.name ?? '',
        technicianEmail: req.user.email.toLowerCase(),
        approvalStatus: 'pending',
        isAvailable: true,
        createdAt: new Date(),
    };
    const result = await services.insertOne(document);
    sendSuccess(res, { ...document, _id: result.insertedId }, 'Service submitted for approval', 201);
});
export const updateService = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const input = req.body;
    const services = await servicesCollection();
    const service = await services.findOne({ _id: parseObjectId(id, 'service id') });
    if (!service)
        throw notFound('Service not found');
    assertOwner(service, req.user.email);
    const allowed = { ...input };
    await services.updateOne({ _id: service._id, technicianEmail: service.technicianEmail }, { $set: { ...allowed, approvalStatus: 'pending' } });
    const updated = await services.findOne({ _id: service._id });
    sendSuccess(res, updated, 'Service updated and sent for re-approval');
});
export const deleteService = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const services = await servicesCollection();
    const service = await services.findOne({ _id: parseObjectId(id, 'service id') });
    if (!service)
        throw notFound('Service not found');
    assertOwner(service, req.user.email);
    await services.deleteOne({ _id: service._id, technicianEmail: service.technicianEmail });
    sendSuccess(res, { id: service._id.toHexString() }, 'Service deleted');
});
export const toggleAvailability = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { isAvailable } = req.body;
    const services = await servicesCollection();
    const service = await services.findOne({ _id: parseObjectId(id, 'service id') });
    if (!service)
        throw notFound('Service not found');
    assertOwner(service, req.user.email);
    await services.updateOne({ _id: service._id, technicianEmail: service.technicianEmail }, { $set: { isAvailable } });
    sendSuccess(res, { id: service._id.toHexString(), isAvailable }, 'Availability updated');
});
export const serviceSchemas = {
    list: listServicesQuerySchema,
    create: createServiceSchema,
    update: updateServiceSchema,
    availability: availabilitySchema,
    params: idParamSchema,
};
