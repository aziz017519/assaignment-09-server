import './setup.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adminSchemas } from '../src/controllers/admin.controller.js';
import { bookingSchemas } from '../src/controllers/bookings.controller.js';
import { paymentSchemas } from '../src/controllers/payments.controller.js';
import { serviceSchemas } from '../src/controllers/services.controller.js';
import { userSchemas } from '../src/controllers/users.controller.js';
import { normalizeSignupRole } from '../src/utils/roles.js';
test('booking schema requires a real problem description and valid contact details', () => {
    const base = {
        serviceId: '507f1f77bcf86cd799439011',
        customerPhone: '+8801811111111',
        address: '12 Main Street, Dhaka',
        preferredDate: '2030-01-01',
        problemDescription: 'The screen is cracked and the touch response is unreliable.',
    };
    assert.equal(bookingSchemas.create.parse(base).problemDescription.length > 20, true);
    assert.throws(() => bookingSchemas.create.parse({ ...base, problemDescription: 'broken' }));
    assert.throws(() => bookingSchemas.create.parse({ ...base, customerPhone: 'abc' }));
    assert.throws(() => bookingSchemas.create.parse({ ...base, address: 'x' }));
});
test('service schema validates category and price and strips client-owned fields', () => {
    const input = {
        title: 'AC Gas Refill',
        category: 'AC',
        description: 'Leak check and refrigerant refill for split AC units.',
        image: 'https://example.com/ac.jpg',
        basePrice: 95,
        estimatedDuration: '2 hours',
        serviceMode: 'Home Visit',
        serviceArea: 'Dhaka',
        approvalStatus: 'approved',
        technicianEmail: 'someone@else.test',
    };
    const parsed = serviceSchemas.create.parse(input);
    assert.equal('approvalStatus' in parsed, false);
    assert.equal('technicianEmail' in parsed, false);
    assert.throws(() => serviceSchemas.create.parse({ ...input, basePrice: -5 }));
    assert.throws(() => serviceSchemas.create.parse({ ...input, category: 'Drone' }));
});
test('payment and admin schemas reject invalid input', () => {
    assert.throws(() => paymentSchemas.create.parse({}));
    assert.doesNotThrow(() => paymentSchemas.create.parse({ bookingId: '507f1f77bcf86cd799439011' }));
    assert.throws(() => adminSchemas.role.parse({ role: 'owner' }));
    assert.doesNotThrow(() => adminSchemas.role.parse({ role: 'technician' }));
});
test('signup role is normalized to customer or technician on the server', () => {
    assert.equal(normalizeSignupRole('technician'), 'technician');
    assert.equal(normalizeSignupRole('admin'), 'customer');
    assert.equal(normalizeSignupRole(undefined), 'customer');
    assert.equal(normalizeSignupRole('anything-else'), 'customer');
    assert.throws(() => userSchemas.signup.parse({ name: 'A', email: 'bad', password: 'short' }));
});
test('profile updates validate shared profile fields and strip mass-assigned fields', () => {
    const parsed = userSchemas.profile.parse({
        name: 'New Name',
        phone: '+8801712345678',
        address: 'Road 12, Sylhet',
        area: 'Sylhet',
        bio: 'Short bio',
        avatar: 'https://i.ibb.co/example/profile.jpg',
        photo: 'https://i.ibb.co/example/legacy.jpg',
        role: 'admin',
        email: 'x@y.test',
    });
    assert.deepEqual(parsed, {
        name: 'New Name',
        phone: '+8801712345678',
        address: 'Road 12, Sylhet',
        area: 'Sylhet',
        bio: 'Short bio',
        avatar: 'https://i.ibb.co/example/profile.jpg',
        photo: 'https://i.ibb.co/example/legacy.jpg',
    });
    assert.throws(() => userSchemas.profile.parse({ name: 'A' }));
    assert.throws(() => userSchemas.profile.parse({ phone: '12345' }));
    assert.throws(() => userSchemas.profile.parse({ address: 'x'.repeat(301) }));
    assert.throws(() => userSchemas.profile.parse({ bio: 'x'.repeat(301) }));
    assert.throws(() => userSchemas.profile.parse({ avatar: 'not-a-url' }));
    assert.throws(() => userSchemas.profile.parse({}));
});
