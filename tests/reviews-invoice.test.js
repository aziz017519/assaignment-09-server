import './setup.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';

const OWNER_EMAIL = 'sadia.reviews@example.test';
const OTHER_EMAIL = 'tanvir.reviews@example.test';
const TECHNICIAN_EMAIL = 'tech.reviews@example.test';
const SERVICE_ID = new ObjectId('507f1f77bcf86cd7994390a1');
const TOP_SERVICE_ID = new ObjectId('507f1f77bcf86cd7994390a2');
const UNRATED_SERVICE_ID = new ObjectId('507f1f77bcf86cd7994390a3');
const PAID_BOOKING_ID = new ObjectId('507f1f77bcf86cd799439011');
const UNPAID_BOOKING_ID = new ObjectId('507f1f77bcf86cd799439012');
const PAID_AT = new Date('2026-01-15T10:30:00.000Z');

function seedState() {
    return {
        users: [
            { _id: new ObjectId(), name: 'Sadia Islam', email: OWNER_EMAIL, role: 'customer' },
            { _id: new ObjectId(), name: 'Tanvir Hasan', email: OTHER_EMAIL, role: 'customer' },
            { _id: new ObjectId(), name: 'Rahman Ahmed', email: TECHNICIAN_EMAIL, role: 'technician' },
        ],
        user: [],
        services: [
            {
                _id: SERVICE_ID,
                title: 'Smartphone Screen Replacement',
                category: 'Smartphone',
                description: 'Cracked display replacement with warranty.',
                image: 'https://example.test/phone.jpg',
                basePrice: 89,
                technicianName: 'Rahman Ahmed',
                technicianEmail: TECHNICIAN_EMAIL,
                approvalStatus: 'approved',
                isAvailable: true,
                ratingSum: 4,
                ratingCount: 1,
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
            },
            {
                _id: TOP_SERVICE_ID,
                title: 'AC Gas Refill',
                category: 'AC',
                description: 'Leak check and refrigerant refill.',
                image: 'https://example.test/ac.jpg',
                basePrice: 95,
                technicianName: 'Rahman Ahmed',
                technicianEmail: TECHNICIAN_EMAIL,
                approvalStatus: 'approved',
                isAvailable: true,
                ratingSum: 15,
                ratingCount: 3,
                createdAt: new Date('2026-01-02T00:00:00.000Z'),
            },
            {
                _id: UNRATED_SERVICE_ID,
                title: 'TV Power Board Repair',
                category: 'TV',
                description: 'No-power fault diagnosis and repair.',
                image: 'https://example.test/tv.jpg',
                basePrice: 110,
                technicianName: 'Rahman Ahmed',
                technicianEmail: TECHNICIAN_EMAIL,
                approvalStatus: 'approved',
                isAvailable: true,
                ratingSum: 0,
                ratingCount: 0,
                createdAt: new Date('2026-01-03T00:00:00.000Z'),
            },
        ],
        bookings: [
            {
                _id: PAID_BOOKING_ID,
                serviceId: SERVICE_ID,
                serviceTitle: 'Smartphone Screen Replacement',
                category: 'Smartphone',
                customerName: 'Sadia Islam',
                customerEmail: OWNER_EMAIL,
                customerPhone: '+8801811111111',
                technicianName: 'Rahman Ahmed',
                technicianEmail: TECHNICIAN_EMAIL,
                address: '12 Main Street, Dhaka',
                problemDescription: 'The screen is cracked and touch response is unreliable.',
                finalAmount: 89,
                basePrice: 89,
                status: 'completed',
                paymentStatus: 'paid',
                createdAt: new Date('2026-01-10T00:00:00.000Z'),
            },
            {
                _id: UNPAID_BOOKING_ID,
                serviceId: SERVICE_ID,
                serviceTitle: 'Smartphone Screen Replacement',
                category: 'Smartphone',
                customerName: 'Sadia Islam',
                customerEmail: OWNER_EMAIL,
                technicianName: 'Rahman Ahmed',
                technicianEmail: TECHNICIAN_EMAIL,
                problemDescription: 'The phone will not charge after a drop.',
                finalAmount: 89,
                basePrice: 89,
                status: 'completed',
                paymentStatus: 'unpaid',
                createdAt: new Date('2026-01-11T00:00:00.000Z'),
            },
        ],
        payments: [
            {
                _id: new ObjectId(),
                bookingId: PAID_BOOKING_ID,
                amount: 89,
                currency: 'usd',
                paymentStatus: 'paid',
                status: 'paid',
                paidAt: PAID_AT,
                createdAt: PAID_AT,
                transactionId: 'pi_test_secret_should_not_be_exposed',
                stripeSessionId: 'cs_test_secret_should_not_be_exposed',
            },
        ],
        session: [],
        account: [],
    };
}

const state = seedState();

function clone(value) {
    if (value === null || value === undefined)
        return value;
    if (value instanceof Date)
        return new Date(value.getTime());
    if (value instanceof ObjectId)
        return new ObjectId(value);
    if (Array.isArray(value))
        return value.map(clone);
    if (typeof value === 'object') {
        const result = {};
        for (const [key, item] of Object.entries(value))
            result[key] = clone(item);
        return result;
    }
    return value;
}

function isCondition(value) {
    return Boolean(value) &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !(value instanceof Date) &&
        !(value instanceof ObjectId) &&
        !(value instanceof RegExp);
}

function equalValues(left, right) {
    if (left instanceof ObjectId || right instanceof ObjectId)
        return String(left) === String(right);
    if (left instanceof Date && right instanceof Date)
        return left.getTime() === right.getTime();
    return left === right;
}

function matches(document, filter) {
    if (!filter || typeof filter !== 'object')
        return false;
    return Object.entries(filter).every(([key, condition]) => {
        if (key === '$or')
            return Array.isArray(condition) && condition.some((part) => matches(document, part));
        if (key === '$and')
            return Array.isArray(condition) && condition.every((part) => matches(document, part));
        const value = document[key];
        if (!isCondition(condition))
            return equalValues(value, condition);
        return Object.entries(condition).every(([operator, expected]) => {
            if (operator === '$exists')
                return (value !== undefined) === Boolean(expected);
            if (operator === '$eq')
                return equalValues(value, expected);
            if (operator === '$ne')
                return !equalValues(value, expected);
            if (operator === '$gt')
                return value > expected;
            if (operator === '$gte')
                return value >= expected;
            if (operator === '$lt')
                return value < expected;
            if (operator === '$lte')
                return value <= expected;
            if (operator === '$in')
                return Array.isArray(expected) && expected.some((item) => equalValues(value, item));
            if (operator === '$regex') {
                const pattern = expected instanceof RegExp
                    ? expected
                    : new RegExp(expected, condition.$options);
                return pattern.test(String(value ?? ''));
            }
            if (operator === '$options')
                return true;
            return false;
        });
    });
}

function project(document, projection) {
    if (!projection)
        return document;
    const fields = Object.entries(projection)
        .filter(([, value]) => value === 1 || value === true)
        .map(([key]) => key);
    if (!fields.length)
        return document;
    const result = {};
    for (const field of fields) {
        if (document[field] !== undefined)
            result[field] = clone(document[field]);
    }
    return result;
}

function compareValues(left, right) {
    if (left === right)
        return 0;
    if (left === undefined || left === null)
        return -1;
    if (right === undefined || right === null)
        return 1;
    if (left < right)
        return -1;
    if (left > right)
        return 1;
    return 0;
}

function compareDocuments(left, right, spec) {
    for (const [field, direction] of Object.entries(spec)) {
        const result = compareValues(left[field], right[field]);
        if (result)
            return result * direction;
    }
    return 0;
}

function setPath(document, path, value) {
    const parts = path.split('.');
    let target = document;
    for (const part of parts.slice(0, -1)) {
        if (!target[part] || typeof target[part] !== 'object')
            target[part] = {};
        target = target[part];
    }
    target[parts.at(-1)] = clone(value);
}

function applyUpdate(document, update) {
    for (const [path, value] of Object.entries(update.$set ?? {}))
        setPath(document, path, value);
    for (const [path, amount] of Object.entries(update.$inc ?? {}))
        setPath(document, path, (document[path] ?? 0) + amount);
    for (const path of Object.keys(update.$unset ?? {}))
        delete document[path];
    for (const [path, value] of Object.entries(update.$push ?? {})) {
        if (!Array.isArray(document[path]))
            document[path] = [];
        document[path].push(clone(value));
    }
    return document;
}

function aggregate(rows, pipeline) {
    let result = rows.map(clone);
    for (const stage of pipeline) {
        if (stage.$match)
            result = result.filter((document) => matches(document, stage.$match));
        else if (stage.$project)
            result = result.map((document) => project(document, stage.$project));
        else if (stage.$sort)
            result.sort((left, right) => compareDocuments(left, right, stage.$sort));
        else if (stage.$skip)
            result = result.slice(stage.$skip);
        else if (stage.$limit)
            result = result.slice(0, stage.$limit);
        else if (stage.$group) {
            const { _id: expression, ...accumulators } = stage.$group;
            const groups = new Map();
            for (const document of result) {
                const keyValue = typeof expression === 'string' && expression.startsWith('$')
                    ? document[expression.slice(1)]
                    : expression;
                const key = String(keyValue);
                if (!groups.has(key)) {
                    const group = { _id: keyValue };
                    for (const field of Object.keys(accumulators))
                        group[field] = 0;
                    groups.set(key, group);
                }
                const group = groups.get(key);
                for (const [field, definition] of Object.entries(accumulators)) {
                    const source = definition.$sum;
                    if (source === 1)
                        group[field] += 1;
                    else if (typeof source === 'string' && source.startsWith('$'))
                        group[field] += Number(document[source.slice(1)]) || 0;
                }
            }
            result = [...groups.values()];
        }
    }
    return result;
}

function makeCollection(name) {
    return {
        async findOne(filter = {}, options = {}) {
            const document = state[name].find((item) => matches(item, filter));
            return document ? project(clone(document), options.projection) : null;
        },
        find(filter = {}, options = {}) {
            let rows = state[name]
                .filter((document) => matches(document, filter))
                .map((document) => project(clone(document), options.projection));
            const cursor = {
                sort(spec) {
                    rows.sort((left, right) => compareDocuments(left, right, spec));
                    return cursor;
                },
                skip(amount) {
                    rows = rows.slice(amount);
                    return cursor;
                },
                limit(amount) {
                    rows = rows.slice(0, amount);
                    return cursor;
                },
                async toArray() {
                    return rows;
                },
            };
            return cursor;
        },
        async countDocuments(filter = {}) {
            return state[name].filter((document) => matches(document, filter)).length;
        },
        async updateOne(filter, update) {
            const index = state[name].findIndex((document) => matches(document, filter));
            if (index === -1)
                return { matchedCount: 0, modifiedCount: 0, upsertedId: null };
            state[name][index] = applyUpdate(clone(state[name][index]), update);
            return { matchedCount: 1, modifiedCount: 1, upsertedId: null };
        },
        async insertOne(document) {
            const inserted = clone(document);
            state[name].push(inserted);
            return { insertedId: inserted._id };
        },
        async aggregate(pipeline = []) {
            const rows = aggregate(state[name], pipeline);
            return { toArray: async () => rows };
        },
    };
}

const fakeDb = { collection: makeCollection };
const fakeClient = { db: () => fakeDb };
let server;
let baseUrl;

before(async () => {
    globalThis.__fixmateClientPromise = Promise.resolve(fakeClient);
    await new Promise((resolve) => {
        server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
    const fresh = seedState();
    for (const key of Object.keys(state)) {
        state[key].length = 0;
        state[key].push(...fresh[key]);
    }
});

after(async () => {
    if (server) {
        await new Promise((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
    globalThis.__fixmateClientPromise = undefined;
});

function authHeader(email) {
    return `Bearer ${jwt.sign({ email }, env.JWT_SECRET, { expiresIn: '1h' })}`;
}

async function api(path, { method = 'GET', email, body } = {}) {
    const headers = {};
    if (email)
        headers.Authorization = authHeader(email);
    if (body !== undefined)
        headers['Content-Type'] = 'application/json';
    return fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

function bookingById(id) {
    return state.bookings.find((booking) => String(booking._id) === String(id));
}

function serviceById(id) {
    return state.services.find((service) => String(service._id) === String(id));
}

test('POST review stores the review and updates service aggregates', async () => {
    const response = await api(`/api/bookings/${PAID_BOOKING_ID}/review`, {
        method: 'POST',
        email: OWNER_EMAIL,
        body: { rating: 5, review: '  Fixed the screen quickly.  ' },
    });
    const body = await response.json();
    assert.equal(response.status, 201, JSON.stringify(body));
    assert.equal(body.success, true);
    assert.equal(body.data.rating, 5);
    assert.equal(body.data.review, 'Fixed the screen quickly.');
    assert.ok(body.data.reviewedAt);
    assert.equal(body.data.service.averageRating, 4.5);
    assert.equal(body.data.service.ratingCount, 2);

    const booking = bookingById(PAID_BOOKING_ID);
    assert.equal(booking.rating, 5);
    assert.equal(booking.review, 'Fixed the screen quickly.');
    assert.ok(booking.reviewedAt);
    const service = serviceById(SERVICE_ID);
    assert.equal(service.ratingSum, 9);
    assert.equal(service.ratingCount, 2);
});

test('POST review rejects another customer with 403', async () => {
    const response = await api(`/api/bookings/${PAID_BOOKING_ID}/review`, {
        method: 'POST',
        email: OTHER_EMAIL,
        body: { rating: 5 },
    });
    const body = await response.json();
    assert.equal(response.status, 403, JSON.stringify(body));
    assert.equal(body.success, false);
    assert.equal(bookingById(PAID_BOOKING_ID).rating, undefined);
});

test('POST review rejects an unpaid booking with 400', async () => {
    const response = await api(`/api/bookings/${UNPAID_BOOKING_ID}/review`, {
        method: 'POST',
        email: OWNER_EMAIL,
        body: { rating: 4 },
    });
    const body = await response.json();
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.match(body.message, /paid/i);
    assert.equal(bookingById(UNPAID_BOOKING_ID).rating, undefined);
});

test('POST review returns 409 on a duplicate and 404 for an invalid id', async () => {
    const first = await api(`/api/bookings/${PAID_BOOKING_ID}/review`, {
        method: 'POST',
        email: OWNER_EMAIL,
        body: { rating: 5 },
    });
    assert.equal(first.status, 201);
    const duplicate = await api(`/api/bookings/${PAID_BOOKING_ID}/review`, {
        method: 'POST',
        email: OWNER_EMAIL,
        body: { rating: 2 },
    });
    const body = await duplicate.json();
    assert.equal(duplicate.status, 409, JSON.stringify(body));

    const invalid = await api('/api/bookings/not-an-object-id/review', {
        method: 'POST',
        email: OWNER_EMAIL,
        body: { rating: 5 },
    });
    assert.equal(invalid.status, 404);
});

test('POST review validates the rating range', async () => {
    for (const rating of [0, 6, 2.5, '5']) {
        const response = await api(`/api/bookings/${PAID_BOOKING_ID}/review`, {
            method: 'POST',
            email: OWNER_EMAIL,
            body: { rating },
        });
        assert.equal(response.status, 400, `rating ${rating}`);
        assert.equal(bookingById(PAID_BOOKING_ID).rating, undefined);
    }
});

test('service average is calculated from ratingSum and ratingCount', async () => {
    const response = await api(`/api/bookings/${PAID_BOOKING_ID}/review`, {
        method: 'POST',
        email: OWNER_EMAIL,
        body: { rating: 3 },
    });
    const body = await response.json();
    assert.equal(response.status, 201, JSON.stringify(body));
    assert.equal(body.data.service.averageRating, 3.5);
    assert.equal(serviceById(SERVICE_ID).ratingSum, 7);
    assert.equal(serviceById(SERVICE_ID).ratingCount, 2);

    const detail = await (await api(`/api/services/${SERVICE_ID}`)).json();
    assert.equal(detail.data.averageRating, 3.5);
    assert.equal(detail.data.ratingCount, 2);
    assert.equal('ratingSum' in detail.data, false);
});

test('public reviews are newest first and hide emails and payment identifiers', async () => {
    const reviewed = await api(`/api/bookings/${PAID_BOOKING_ID}/review`, {
        method: 'POST',
        email: OWNER_EMAIL,
        body: { rating: 5, review: 'Excellent service.' },
    });
    assert.equal(reviewed.status, 201);
    state.bookings.push({
        _id: new ObjectId(),
        serviceId: SERVICE_ID,
        rating: 2,
        review: 'Later follow-up review.',
        reviewedAt: new Date('2027-01-01T00:00:00.000Z'),
        customerName: 'Tanvir Hasan',
        customerEmail: OTHER_EMAIL,
    });

    const response = await api(`/api/services/${SERVICE_ID}/reviews?page=1&limit=10`);
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.data.data.length, 2);
    assert.equal(body.data.data[0].customerName, 'Tanvir');
    assert.equal(body.data.data[0].review, 'Later follow-up review.');
    assert.equal(body.data.data[1].customerName, 'Sadia');
    assert.equal(body.data.data[1].review, 'Excellent service.');
    assert.deepEqual(Object.keys(body.data.data[0]).sort(), [
        'customerName',
        'rating',
        'review',
        'reviewedAt',
    ]);
    const payload = JSON.stringify(body);
    assert.equal(payload.includes(OWNER_EMAIL), false);
    assert.equal(payload.includes(TECHNICIAN_EMAIL), false);
    assert.equal(payload.includes('cs_test_secret'), false);
    assert.equal(payload.includes('pi_test_secret'), false);
});

test('GET bookings/my exposes review fields and canReview', async () => {
    const response = await api('/api/bookings/my', { email: OWNER_EMAIL });
    const body = await response.json();
    assert.equal(response.status, 200);
    const paid = body.data.find((booking) => String(booking._id) === String(PAID_BOOKING_ID));
    const unpaid = body.data.find((booking) => String(booking._id) === String(UNPAID_BOOKING_ID));
    assert.equal(paid.rating, null);
    assert.equal(paid.review, null);
    assert.equal(paid.reviewedAt, null);
    assert.equal(paid.canReview, true);
    assert.equal(unpaid.canReview, false);
});

test('GET invoice returns a PDF for the owner with safe headers', async () => {
    const response = await api(`/api/bookings/${PAID_BOOKING_ID}/invoice`, { email: OWNER_EMAIL });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/pdf/);
    assert.equal(
        response.headers.get('content-disposition'),
        'attachment; filename="invoice-FM-20260115-439011.pdf"',
    );
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const pdf = Buffer.from(await response.arrayBuffer());
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
});

test('GET invoice rejects another customer and unpaid bookings', async () => {
    const forbiddenResponse = await api(`/api/bookings/${PAID_BOOKING_ID}/invoice`, { email: OTHER_EMAIL });
    const forbiddenBody = await forbiddenResponse.json();
    assert.equal(forbiddenResponse.status, 403, JSON.stringify(forbiddenBody));

    const unpaidResponse = await api(`/api/bookings/${UNPAID_BOOKING_ID}/invoice`, { email: OWNER_EMAIL });
    const unpaidBody = await unpaidResponse.json();
    assert.equal(unpaidResponse.status, 400, JSON.stringify(unpaidBody));
    assert.match(unpaidBody.message, /paid/i);
});

test('GET services supports rating_desc and exposes derived rating fields', async () => {
    const response = await api('/api/services?sort=rating_desc&limit=10');
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.deepEqual(body.data.data.map((service) => service.averageRating), [5, 4, 0]);
    assert.equal(String(body.data.data[0]._id), String(TOP_SERVICE_ID));
    assert.equal(body.data.data[0].ratingCount, 3);
    assert.equal(body.data.data[2].averageRating, 0);
    assert.equal('ratingSum' in body.data.data[0], false);
});
