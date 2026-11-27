import './setup.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';

const CUSTOMER_EMAIL = 'customer.requests@example.test';
const TECH_A_EMAIL = 'techa.requests@example.test';
const TECH_B_EMAIL = 'techb.requests@example.test';
const TECH_A_MIXED_CASE_EMAIL = 'TechA.Requests@Example.Test';

const SERVICE_A_CREATE_ID = new ObjectId('507f1f77bcf86cd799439001');
const SERVICE_A_REQUESTED_ID = new ObjectId('507f1f77bcf86cd799439002');
const SERVICE_B_REQUESTED_ID = new ObjectId('507f1f77bcf86cd799439003');
const SERVICE_A_LEGACY_ID = new ObjectId('507f1f77bcf86cd799439004');
const A_REQUESTED_ID = new ObjectId('507f191e810c19729de860ea');
const B_REQUESTED_ID = new ObjectId('507f191e810c19729de860eb');
const A_LEGACY_ID = new ObjectId('507f191e810c19729de860ec');

function createdAt(offsetDays = 0) {
    return new Date(Date.UTC(2026, 0, 10 + offsetDays));
}

function seedState() {
    return {
        users: [
            { _id: new ObjectId('507f191e810c19729de86001'), name: 'Request Customer', email: CUSTOMER_EMAIL, role: 'customer' },
            { _id: new ObjectId('507f191e810c19729de86002'), name: 'Tech A', email: TECH_A_EMAIL, role: 'technician' },
            { _id: new ObjectId('507f191e810c19729de86003'), name: 'Tech B', email: TECH_B_EMAIL, role: 'technician' },
        ],
        user: [],
        services: [
            {
                _id: SERVICE_A_CREATE_ID,
                title: 'Phone Screen Repair',
                category: 'Mobile Phone',
                description: 'Screen replacement with warranty.',
                image: 'https://example.test/phone.jpg',
                basePrice: 89,
                technicianName: 'Tech A',
                technicianEmail: TECH_A_MIXED_CASE_EMAIL,
                approvalStatus: 'approved',
                isAvailable: true,
                createdAt: createdAt(),
            },
            {
                _id: SERVICE_A_REQUESTED_ID,
                title: 'AC Gas Refill',
                category: 'AC',
                description: 'Leak check and refrigerant refill.',
                image: 'https://example.test/ac.jpg',
                basePrice: 95,
                technicianName: 'Tech A',
                technicianEmail: TECH_A_EMAIL,
                approvalStatus: 'approved',
                isAvailable: true,
                createdAt: createdAt(),
            },
            {
                _id: SERVICE_B_REQUESTED_ID,
                title: 'Laptop Fan Replacement',
                category: 'Computer & Laptop',
                description: 'Fan diagnosis and replacement.',
                image: 'https://example.test/laptop.jpg',
                basePrice: 75,
                technicianName: 'Tech B',
                technicianEmail: TECH_B_EMAIL,
                approvalStatus: 'approved',
                isAvailable: true,
                createdAt: createdAt(),
            },
            {
                _id: SERVICE_A_LEGACY_ID,
                title: 'TV Board Repair',
                category: 'TV & Display',
                description: 'Power board diagnosis and repair.',
                image: 'https://example.test/tv.jpg',
                basePrice: 110,
                technicianName: 'Tech A',
                technicianEmail: TECH_A_EMAIL,
                approvalStatus: 'approved',
                isAvailable: true,
                createdAt: createdAt(),
            },
        ],
        bookings: [
            {
                _id: A_REQUESTED_ID,
                serviceId: SERVICE_A_REQUESTED_ID,
                serviceTitle: 'AC Gas Refill',
                customerName: 'Request Customer',
                customerEmail: CUSTOMER_EMAIL,
                customerPhone: '+8801711111111',
                technicianName: 'Tech A',
                technicianEmail: TECH_A_EMAIL,
                address: '12 Main Street, Dhaka',
                problemDescription: 'The AC is not cooling and the outdoor unit will not start.',
                status: 'requested',
                paymentStatus: 'unpaid',
                statusHistory: [{ status: 'requested', changedAt: createdAt() }],
                createdAt: createdAt(),
            },
            {
                _id: B_REQUESTED_ID,
                serviceId: SERVICE_B_REQUESTED_ID,
                serviceTitle: 'Laptop Fan Replacement',
                customerName: 'Request Customer',
                customerEmail: CUSTOMER_EMAIL,
                customerPhone: '+8801711111111',
                technicianName: 'Tech B',
                technicianEmail: TECH_B_EMAIL,
                address: '12 Main Street, Dhaka',
                problemDescription: 'The laptop fan is loud and the device overheats quickly.',
                status: 'requested',
                paymentStatus: 'unpaid',
                statusHistory: [{ status: 'requested', changedAt: createdAt() }],
                createdAt: createdAt(1),
            },
            {
                _id: A_LEGACY_ID,
                serviceId: SERVICE_A_LEGACY_ID,
                serviceTitle: 'TV Board Repair',
                customerName: 'Request Customer',
                customerEmail: CUSTOMER_EMAIL,
                customerPhone: '+8801711111111',
                technicianName: 'Tech A',
                // Legacy rows predate the lowercase ownership normalization.
                technicianEmail: TECH_A_MIXED_CASE_EMAIL,
                address: '12 Main Street, Dhaka',
                problemDescription: 'The television has no power and shows no indicator light.',
                status: 'accepted',
                paymentStatus: 'unpaid',
                statusHistory: [{ status: 'requested', changedAt: createdAt() }],
                createdAt: createdAt(2),
            },
        ],
        payments: [],
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
            if (operator === '$in')
                return Array.isArray(expected) && expected.some((item) => {
                    if (item instanceof RegExp)
                        return item.test(String(value ?? ''));
                    return equalValues(value, item);
                });
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

function compareDocuments(left, right, spec) {
    for (const [field, direction] of Object.entries(spec)) {
        const a = left[field];
        const b = right[field];
        if (equalValues(a, b))
            continue;
        if (a === undefined || a === null)
            return -1 * direction;
        if (b === undefined || b === null)
            return 1 * direction;
        return (a < b ? -1 : 1) * direction;
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
                async toArray() {
                    return rows;
                },
            };
            return cursor;
        },
        async insertOne(document) {
            const inserted = clone(document);
            state[name].push(inserted);
            return { insertedId: inserted._id };
        },
        async updateOne(filter, update) {
            const index = state[name].findIndex((document) => matches(document, filter));
            if (index === -1)
                return { matchedCount: 0, modifiedCount: 0 };
            state[name][index] = applyUpdate(clone(state[name][index]), update);
            return { matchedCount: 1, modifiedCount: 1 };
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

async function listedIds(email, query = '') {
    const response = await api(`/api/bookings/technician${query}`, { email });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.success, true);
    return body.data.map((booking) => String(booking._id));
}

test('POST /api/bookings stores technician identity from the service and starts as requested', async () => {
    const response = await api('/api/bookings', {
        method: 'POST',
        email: CUSTOMER_EMAIL,
        body: {
            serviceId: String(SERVICE_A_CREATE_ID),
            customerPhone: '+8801711111111',
            address: '12 Main Street, Dhaka',
            preferredDate: '2030-01-01',
            problemDescription: 'The screen is cracked and the touch response is unreliable.',
            // Client-supplied ownership/admin fields must be ignored.
            technicianEmail: 'attacker@example.test',
            technicianId: 'attacker',
            technicianName: 'Attacker',
            status: 'completed',
            approvalStatus: 'approved',
        },
    });
    const body = await response.json();
    assert.equal(response.status, 201, JSON.stringify(body));

    const created = state.bookings.at(-1);
    assert.equal(String(created.serviceId), String(SERVICE_A_CREATE_ID));
    assert.equal(created.technicianEmail, TECH_A_EMAIL);
    assert.equal(created.technicianName, 'Tech A');
    assert.equal(created.status, 'requested');
    assert.equal(created.paymentStatus, 'unpaid');
    assert.deepEqual(created.statusHistory.map((entry) => entry.status), ['requested']);
    assert.equal('technicianId' in created, false);
    assert.equal('approvalStatus' in created, false);
});

test('GET /api/bookings/technician returns only the owning technician\'s bookings', async () => {
    const forA = await listedIds(TECH_A_EMAIL);
    const forB = await listedIds(TECH_B_EMAIL);

    assert.equal(forA.includes(String(A_REQUESTED_ID)), true);
    assert.equal(forA.includes(String(B_REQUESTED_ID)), false);
    assert.equal(forB.includes(String(B_REQUESTED_ID)), true);
    assert.equal(forB.includes(String(A_REQUESTED_ID)), false);
});

test('owning technician can PATCH requested to accepted', async () => {
    const response = await api(`/api/bookings/${A_REQUESTED_ID}/status`, {
        method: 'PATCH',
        email: TECH_A_EMAIL,
        body: { status: 'accepted' },
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'accepted');
    assert.equal(bookingById(A_REQUESTED_ID).status, 'accepted');
    assert.equal(bookingById(A_REQUESTED_ID).technicianEmail, TECH_A_EMAIL);
});

test('another technician gets 403 when updating a booking owned by technician A', async () => {
    const response = await api(`/api/bookings/${A_REQUESTED_ID}/status`, {
        method: 'PATCH',
        email: TECH_B_EMAIL,
        body: { status: 'accepted' },
    });
    const body = await response.json();
    assert.equal(response.status, 403, JSON.stringify(body));
    assert.equal(body.success, false);
    assert.equal(bookingById(A_REQUESTED_ID).status, 'requested');
});

test('status updates require the exact status field and accepted/rejected values', async () => {
    for (const body of [{ accept: true }, { status: 'accept' }, { status: 'reject' }]) {
        const response = await api(`/api/bookings/${A_REQUESTED_ID}/status`, {
            method: 'PATCH',
            email: TECH_A_EMAIL,
            body,
        });
        assert.equal(response.status, 400, JSON.stringify(body));
        assert.equal(bookingById(A_REQUESTED_ID).status, 'requested');
    }
});

test('technician booking routes require authentication and the technician role', async () => {
    const anonymousGet = await api('/api/bookings/technician');
    assert.equal(anonymousGet.status, 401);

    const customerGet = await api('/api/bookings/technician', { email: CUSTOMER_EMAIL });
    assert.equal(customerGet.status, 403);

    const anonymousPatch = await api(`/api/bookings/${A_REQUESTED_ID}/status`, {
        method: 'PATCH',
        body: { status: 'accepted' },
    });
    assert.equal(anonymousPatch.status, 401);
});

test('legacy mixed-case technician emails remain visible with an exact status filter', async () => {
    const forA = await listedIds(TECH_A_EMAIL);
    assert.equal(forA.includes(String(A_LEGACY_ID)), true);

    const forB = await listedIds(TECH_B_EMAIL);
    assert.equal(forB.includes(String(A_LEGACY_ID)), false);

    const requestedOnly = await listedIds(TECH_A_EMAIL, '?status=requested');
    assert.equal(requestedOnly.includes(String(A_REQUESTED_ID)), true);
    assert.equal(requestedOnly.includes(String(A_LEGACY_ID)), false);
});
