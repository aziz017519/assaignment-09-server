import './setup.js';
import assert from 'node:assert/strict';
import net from 'node:net';
import { after, before, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { authUsersCollection, connectDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';

let server;
let baseUrl;
let insertedId;
let dbReady = false;

function mongoTarget() {
    try {
        const url = new URL(env.MONGODB_URI);
        return {
            host: url.hostname || '127.0.0.1',
            port: Number(url.port || 27017),
        };
    }
    catch {
        return { host: '127.0.0.1', port: 27017 };
    }
}

function isMongoReachable() {
    const { host, port } = mongoTarget();
    return new Promise((resolve) => {
        const socket = net.connect(port, host);
        socket.setTimeout(500);
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('error', () => {
            socket.destroy();
            resolve(false);
        });
        socket.once('timeout', () => {
            socket.destroy();
            resolve(false);
        });
    });
}

before(async () => {
    if (!(await isMongoReachable())) return;
    try {
        await connectDB();
    }
    catch {
        return;
    }
    dbReady = true;
    await new Promise((resolve) => {
        server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (insertedId && dbReady) {
        const users = await authUsersCollection();
        await users.deleteOne({ _id: insertedId });
    }
    if (server) {
        await new Promise((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
});

test('PATCH /api/users/profile maps avatar to image in the BetterAuth user store', async (t) => {
    if (!dbReady) {
        t.skip('MongoDB is not available');
        return;
    }
    const email = `profile.${Date.now()}@example.test`;
    const users = await authUsersCollection();
    const inserted = await users.insertOne({
        name: 'Old Name',
        email,
        role: 'customer',
        phone: '01711111111',
        address: 'Old Road, Sylhet',
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    insertedId = inserted.insertedId;
    const token = jwt.sign(
        { email, sub: insertedId.toHexString() },
        env.JWT_SECRET,
        { expiresIn: '1h' },
    );
    const avatar = 'https://i.ibb.co/example/profile.jpg';

    const response = await fetch(`${baseUrl}/api/users/profile`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: 'New Name',
            phone: '+8801712345678',
            address: 'Road 12, Dhaka',
            avatar,
            role: 'admin',
            email: 'attacker@example.test',
        }),
    });
    const body = await response.json();

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.success, true);
    assert.equal(body.data.name, 'New Name');
    assert.equal(body.data.phone, '+8801712345678');
    assert.equal(body.data.address, 'Road 12, Dhaka');
    assert.equal(body.data.image, avatar);
    assert.equal(body.data.avatar, avatar);
    assert.equal(body.data.email, email);
    assert.equal(body.data.role, 'customer');

    const stored = await users.findOne({ _id: insertedId });
    assert.equal(stored.image, avatar);
    assert.equal(stored.address, 'Road 12, Dhaka');
    assert.equal(stored.email, email);
    assert.equal(stored.role, 'customer');
    assert.equal(stored.avatar, undefined);
});
