/**
 * Manual demo data for the technician overview page.
 *
 *   npm run seed:technician-overview
 *
 * This only touches records owned by overview-demo-technician@fixmate.test.
 * It is safe to run more than once: it replaces that demo technician's data.
 */
import { hashPassword } from '@better-auth/utils/password';
import { ObjectId } from 'mongodb';
import {
    accountsCollection,
    authUsersCollection,
    bookingsCollection,
    closeDB,
    paymentsCollection,
    servicesCollection,
} from '../config/db.js';

const EMAIL = 'overview-demo-technician@fixmate.test';
const ZERO_EMAIL = 'overview-zero-technician@fixmate.test';
const CUSTOMER_EMAIL = 'overview-demo-customer@fixmate.test';
const PASSWORD = 'Demo@12345';

function monthsAgo(count) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - count, 15, 12));
}

async function main() {
    const now = new Date();
    const userId = new ObjectId();
    const zeroUserId = new ObjectId();
    const customerUserId = new ObjectId();
    const users = await authUsersCollection();
    const accounts = await accountsCollection();
    const services = await servicesCollection();
    const bookings = await bookingsCollection();
    const payments = await paymentsCollection();

    const emails = [EMAIL, ZERO_EMAIL, CUSTOMER_EMAIL];
    const accountIds = [...emails, userId.toHexString(), zeroUserId.toHexString(), customerUserId.toHexString()];
    await Promise.all([
        bookings.deleteMany({ technicianEmail: { $in: emails } }),
        payments.deleteMany({ technicianEmail: { $in: emails } }),
        services.deleteMany({ technicianEmail: { $in: emails } }),
        accounts.deleteMany({ accountId: { $in: accountIds } }),
        users.deleteMany({ email: { $in: emails } }),
    ]);

    const password = await hashPassword(PASSWORD);
    await users.insertOne({
        _id: userId,
        name: 'Overview Demo Technician',
        email: EMAIL,
        emailVerified: true,
        role: 'technician',
        createdAt: now,
        updatedAt: now,
    });
    const helperUsers = [
        { id: customerUserId, email: CUSTOMER_EMAIL, name: 'Overview Demo Customer', role: 'customer' },
        { id: zeroUserId, email: ZERO_EMAIL, name: 'Overview Zero Technician', role: 'technician' },
    ];
    await users.insertMany(helperUsers.map((user) => ({
        _id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: true,
        role: user.role,
        createdAt: now,
        updatedAt: now,
    })));
    await accounts.insertMany([
        {
            _id: new ObjectId(),
            userId: userId.toHexString(),
            accountId: userId.toHexString(),
            providerId: 'credential',
            password,
            createdAt: now,
            updatedAt: now,
        },
        ...helperUsers.map((user) => ({
            _id: new ObjectId(),
            userId: user.id.toHexString(),
            accountId: user.id.toHexString(),
            providerId: 'credential',
            password,
            createdAt: now,
            updatedAt: now,
        })),
    ]);

    const serviceDocs = [
        { title: 'AC Repair Demo', approvalStatus: 'approved' },
        { title: 'Laptop Diagnostics Demo', approvalStatus: 'approved' },
        { title: 'Smart TV Setup Demo', approvalStatus: 'pending' },
    ].map((service) => ({
        _id: new ObjectId(),
        title: service.title,
        description: 'Demo service for the technician overview chart.',
        category: 'AC',
        basePrice: 75,
        estimatedDuration: '1 hour',
        serviceMode: 'Home Visit',
        serviceArea: 'Demo Area',
        image: 'https://placehold.co/600x400',
        technicianEmail: EMAIL,
        technicianName: 'Overview Demo Technician',
        approvalStatus: service.approvalStatus,
        isAvailable: true,
        createdAt: monthsAgo(2),
    }));
    await services.insertMany(serviceDocs);

    const statusCounts = [
        ['requested', 5],
        ['accepted', 2],
        ['in-progress', 1],
        ['completed', 4],
        ['cancelled', 1],
    ];
    const bookingDocs = [];
    for (const [status, count] of statusCounts) {
        for (let index = 0; index < count; index += 1) {
            const createdAt = monthsAgo(index % 6);
            bookingDocs.push({
                _id: new ObjectId(),
                serviceId: serviceDocs[index % serviceDocs.length]._id,
                serviceTitle: serviceDocs[index % serviceDocs.length].title,
                technicianEmail: EMAIL,
                technicianName: 'Overview Demo Technician',
                customerEmail: `demo-customer-${index}@fixmate.test`,
                customerName: `Demo Customer ${index}`,
                customerPhone: '01700000000',
                address: 'Demo address for technician overview testing',
                preferredDate: createdAt,
                problemDescription: 'Demo repair request for overview chart testing.',
                status,
                finalAmount: 75,
                paymentStatus: status === 'completed' ? 'paid' : 'unpaid',
                createdAt,
            });
        }
    }
    await bookings.insertMany(bookingDocs);

    const paymentDocs = bookingDocs
        .filter((booking) => booking.status === 'completed')
        .map((booking) => ({
            _id: new ObjectId(),
            type: 'booking',
            bookingId: booking._id,
            serviceTitle: booking.serviceTitle,
            technicianEmail: EMAIL,
            technicianName: booking.technicianName,
            customerEmail: booking.customerEmail,
            amount: booking.finalAmount,
            currency: 'usd',
            paymentStatus: 'paid',
            status: 'paid',
            paidAt: booking.createdAt,
            createdAt: booking.createdAt,
        }));
    if (paymentDocs.length)
        await payments.insertMany(paymentDocs);

    console.log(`[seed] rich technician: ${EMAIL}`);
    console.log(`[seed] zero-data technician: ${ZERO_EMAIL}`);
    console.log(`[seed] customer: ${CUSTOMER_EMAIL}`);
    console.log(`[seed] password: ${PASSWORD}`);
    console.log(`[seed] services: ${serviceDocs.length}, bookings: ${bookingDocs.length}, payments: ${paymentDocs.length}`);
}

main()
    .catch((error) => {
        console.error('[seed] technician overview seed failed:', error);
        process.exitCode = 1;
    })
    .finally(closeDB);
