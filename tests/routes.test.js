import './setup.js';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../src/app.js';
let server;
let baseUrl;
before(async () => {
    await new Promise((resolve) => {
        server = app.listen(0, () => resolve());
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
    await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
    });
});
test('GET / health route returns success', async () => {
    const response = await fetch(`${baseUrl}/`);
    const body = (await response.json());
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.service, 'FixMate API');
});
test('unknown routes return a JSON 404 instead of an HTML page', async () => {
    const response = await fetch(`${baseUrl}/api/does-not-exist`);
    const body = (await response.json());
    assert.equal(response.status, 404);
    assert.equal(body.success, false);
});
test('invalid service query is rejected with 400 before touching the database', async () => {
    const response = await fetch(`${baseUrl}/api/services?sort=unknown`);
    const body = (await response.json());
    assert.equal(response.status, 400);
    assert.equal(body.success, false);
});
test('protected routes return 401 without a bearer token', async () => {
    for (const path of [
        '/api/bookings/my',
        '/api/admin/stats',
        '/api/technician/stats',
        '/api/users/me',
        '/api/payments/my',
        '/api/payments/verify?session_id=cs_test_missing',
    ]) {
        const response = await fetch(`${baseUrl}${path}`);
        assert.equal(response.status, 401, path);
        const body = (await response.json());
        assert.equal(body.success, false);
    }
});
test('POST /api/bookings rejects requests without a token', async () => {
    const response = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId: 'abc' }),
    });
    assert.equal(response.status, 401);
});
test('Stripe webhook rejects a request with a bad signature', async () => {
    const response = await fetch(`${baseUrl}/api/webhook/stripe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'stripe-signature': 'bad-signature' },
        body: JSON.stringify({ id: 'evt_test' }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json());
    assert.equal(body.success, false);
});
test('CORS blocks a client origin that is not allow-listed', async () => {
    const response = await fetch(`${baseUrl}/`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(response.status, 403);
    const body = (await response.json());
    assert.equal(body.success, false);
});
test('CORS preflight succeeds for the configured client origin', async () => {
    const response = await fetch(`${baseUrl}/api/services`, {
        method: 'OPTIONS',
        headers: {
            Origin: 'http://localhost:3000',
            'Access-Control-Request-Method': 'GET',
        },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
});
