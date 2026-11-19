import './setup.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { AppError } from '../src/utils/errors.js';
import { parseObjectId } from '../src/utils/objectId.js';
import { escapeRegex } from '../src/utils/search.js';
import { ACTIVE_BOOKING_STATUSES, assertStatusTransition, findTransition, } from '../src/utils/statusRules.js';
test('status pipeline allows only the documented technician transitions', () => {
    assert.equal(findTransition('requested', 'accepted')?.actor, 'technician');
    assert.equal(findTransition('accepted', 'in-progress')?.actor, 'technician');
    assert.equal(findTransition('in-progress', 'completed')?.requiresFinalAmount, true);
    assert.equal(findTransition('requested', 'completed'), undefined);
    assert.equal(findTransition('cancelled', 'accepted'), undefined);
    assert.equal(findTransition('completed', 'cancelled'), undefined);
});
test('status pipeline rejects wrong actors and invalid transitions', () => {
    assert.throws(() => assertStatusTransition('requested', 'cancelled', 'technician'), (error) => error instanceof AppError && error.statusCode === 400);
    assert.throws(() => assertStatusTransition('requested', 'accepted', 'customer'), (error) => error instanceof AppError && error.statusCode === 400);
    assert.doesNotThrow(() => assertStatusTransition('requested', 'cancelled', 'customer'));
});
test('active statuses are the ones blocked for duplicate bookings', () => {
    assert.deepEqual([...ACTIVE_BOOKING_STATUSES], ['requested', 'accepted', 'in-progress']);
});
test('regex search input is escaped to prevent regex injection', () => {
    assert.equal(escapeRegex('a+b(c).*'), 'a\\+b\\(c\\)\\.\\*');
    const pattern = new RegExp(escapeRegex('a+b'), 'i');
    assert.equal(pattern.test('A+B service'), true);
    assert.equal(pattern.test('aaab'), false);
});
test('object id parsing accepts valid ids and rejects invalid ones', () => {
    const id = new ObjectId();
    assert.equal(parseObjectId(id.toHexString()).toHexString(), id.toHexString());
    assert.throws(() => parseObjectId('not-an-id'), (error) => error instanceof AppError && error.statusCode === 400);
});
