import { hashPassword } from '@better-auth/utils/password';
import { ObjectId } from 'mongodb';
import { bookingsCollection, closeDB, connectDB, paymentsCollection, servicesCollection, usersCollection, } from '../config/db.js';
import { env } from '../config/env.js';
const DEMO_PASSWORD = 'Demo@12345';
const users = [
    {
        name: 'FixMate Admin',
        email: env.ADMIN_EMAIL.toLowerCase(),
        role: 'admin',
        phone: '+8801700000000',
        area: 'Dhaka',
        bio: 'Platform administrator',
        password: env.ADMIN_PASSWORD,
    },
    {
        name: 'Rahman Ahmed',
        email: 'technician1@fixmate.test',
        role: 'technician',
        phone: '+8801711111111',
        area: 'Dhaka North',
        bio: 'Smartphone and AC specialist with 8 years of experience.',
        password: DEMO_PASSWORD,
    },
    {
        name: 'Karim Hossain',
        email: 'technician2@fixmate.test',
        role: 'technician',
        phone: '+8801722222222',
        area: 'Dhaka South',
        bio: 'Laptop, PC and TV repair expert.',
        password: DEMO_PASSWORD,
    },
    {
        name: 'Rehana Akter',
        email: 'technician3@fixmate.test',
        role: 'technician',
        phone: '+8801733333333',
        area: 'Chattogram',
        bio: 'Home appliance and electrical service technician.',
        password: DEMO_PASSWORD,
    },
    {
        name: 'Sadia Islam',
        email: 'customer1@fixmate.test',
        role: 'customer',
        phone: '+8801811111111',
        area: 'Dhaka North',
        bio: '',
        password: DEMO_PASSWORD,
    },
    {
        name: 'Tanvir Hasan',
        email: 'customer2@fixmate.test',
        role: 'customer',
        phone: '+8801822222222',
        area: 'Dhaka South',
        bio: '',
        password: DEMO_PASSWORD,
    },
];
const image = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=80`;
const services = [
    {
        title: 'Smartphone Screen Replacement',
        category: 'Smartphone',
        description: 'Cracked or unresponsive display replaced with a genuine panel and warranty.',
        image: image('photo-1511707171634-5f897ff02aa9'),
        basePrice: 89,
        estimatedDuration: '1-2 hours',
        serviceMode: 'Shop Drop-off',
        serviceArea: 'Dhaka North',
        technicianEmail: 'technician1@fixmate.test',
        approvalStatus: 'approved',
        isAvailable: true,
    },
    {
        title: 'Smartphone Battery Replacement',
        category: 'Smartphone',
        description: 'Fast battery diagnostics and replacement for all major phone brands.',
        image: image('photo-1603891128711-11b4b03bb138'),
        basePrice: 59,
        estimatedDuration: '45 minutes',
        serviceMode: 'Home Visit',
        serviceArea: 'Dhaka North',
        technicianEmail: 'technician1@fixmate.test',
        approvalStatus: 'approved',
        isAvailable: true,
    },
    {
        title: 'Laptop & PC OS Installation',
        category: 'Laptop & PC',
        description: 'Clean operating system installation with drivers and essential updates.',
        image: image('photo-1517336714731-489689fd1ca8'),
        basePrice: 75,
        estimatedDuration: '2-3 hours',
        serviceMode: 'Shop Drop-off',
        serviceArea: 'Dhaka South',
        technicianEmail: 'technician2@fixmate.test',
        approvalStatus: 'approved',
        isAvailable: true,
    },
    {
        title: 'Laptop Motherboard Repair',
        category: 'Laptop & PC',
        description: 'Component-level motherboard diagnosis and micro-soldering repair.',
        image: image('photo-1593642632823-8f785ba67e45'),
        basePrice: 149,
        estimatedDuration: '1-2 days',
        serviceMode: 'Shop Drop-off',
        serviceArea: 'Dhaka South',
        technicianEmail: 'technician2@fixmate.test',
        approvalStatus: 'approved',
        isAvailable: true,
    },
    {
        title: 'AC Deep Cleaning Service',
        category: 'AC',
        description: 'Indoor and outdoor unit deep cleaning to restore cooling efficiency.',
        image: image('photo-1615874959474-d609969a20ed'),
        basePrice: 65,
        estimatedDuration: '2 hours',
        serviceMode: 'Home Visit',
        serviceArea: 'Dhaka North',
        technicianEmail: 'technician1@fixmate.test',
        approvalStatus: 'approved',
        isAvailable: true,
    },
    {
        title: 'AC Gas Refill',
        category: 'AC',
        description: 'Leak check and environmentally safe refrigerant refill for split AC units.',
        image: image('photo-1616627561950-9f746e330187'),
        basePrice: 95,
        estimatedDuration: '2-3 hours',
        serviceMode: 'Home Visit',
        serviceArea: 'Dhaka North',
        technicianEmail: 'technician1@fixmate.test',
        approvalStatus: 'approved',
        isAvailable: true,
    },
    {
        title: 'Refrigerator Compressor Repair',
        category: 'Refrigerator',
        description: 'Compressor fault diagnosis and repair with genuine spare parts.',
        image: image('photo-1571175443880-49e1d25b2bc5'),
        basePrice: 180,
        estimatedDuration: '3-4 hours',
        serviceMode: 'Home Visit',
        serviceArea: 'Chattogram',
        technicianEmail: 'technician3@fixmate.test',
        approvalStatus: 'approved',
        isAvailable: true,
    },
    {
        title: 'Refrigerator Thermostat Replacement',
        category: 'Refrigerator',
        description: 'Temperature control problems fixed with a new calibrated thermostat.',
        image: image('photo-1584568694244-14fbdf83bd30'),
        basePrice: 85,
        estimatedDuration: '1-2 hours',
        serviceMode: 'Home Visit',
        serviceArea: 'Chattogram',
        technicianEmail: 'technician3@fixmate.test',
        approvalStatus: 'approved',
        isAvailable: true,
    },
    {
        title: 'TV LED Panel Repair',
        category: 'TV',
        description: 'Screen line, dark spot and panel fault repair for LED televisions.',
        image: image('photo-1593359677879-a4bb92f829d1'),
        basePrice: 199,
        estimatedDuration: '1-2 days',
        serviceMode: 'Shop Drop-off',
        serviceArea: 'Dhaka South',
        technicianEmail: 'technician2@fixmate.test',
        approvalStatus: 'approved',
        isAvailable: true,
    },
    {
        title: 'TV Power Board Repair',
        category: 'TV',
        description: 'No-power and flickering issues diagnosed at component level.',
        image: image('photo-1461151304267-38535e780c79'),
        basePrice: 110,
        estimatedDuration: '3-5 hours',
        serviceMode: 'Shop Drop-off',
        serviceArea: 'Dhaka South',
        technicianEmail: 'technician2@fixmate.test',
        approvalStatus: 'approved',
        isAvailable: true,
    },
    {
        title: 'Washing Machine Drum Cleaning',
        category: 'Washing Machine',
        description: 'Deep drum and detergent drawer cleaning to remove mould and odour.',
        image: image('photo-1626806787461-102c1bfaaea1'),
        basePrice: 70,
        estimatedDuration: '1-2 hours',
        serviceMode: 'Home Visit',
        serviceArea: 'Chattogram',
        technicianEmail: 'technician3@fixmate.test',
        approvalStatus: 'approved',
        isAvailable: true,
    },
    {
        title: 'Washing Machine Motor Repair',
        category: 'Washing Machine',
        description: 'Motor winding and capacitor faults repaired with tested parts.',
        image: image('photo-1582735689369-4fe89db7114c'),
        basePrice: 130,
        estimatedDuration: '3-4 hours',
        serviceMode: 'Home Visit',
        serviceArea: 'Chattogram',
        technicianEmail: 'technician3@fixmate.test',
        approvalStatus: 'approved',
        isAvailable: true,
    },
    {
        title: 'Home Electrical Wiring Inspection',
        category: 'Electrical',
        description: 'Safety audit of wiring, earthing and circuit breakers for apartments.',
        image: image('photo-1621905251189-08b45d6a269e'),
        basePrice: 55,
        estimatedDuration: '2 hours',
        serviceMode: 'Home Visit',
        serviceArea: 'Dhaka North',
        technicianEmail: 'technician3@fixmate.test',
        approvalStatus: 'approved',
        isAvailable: true,
    },
    {
        title: 'Switch Board Installation',
        category: 'Electrical',
        description: 'New modular switch boards installed with safe concealed wiring.',
        image: image('photo-1555664424-778a1e5e1b48'),
        basePrice: 45,
        estimatedDuration: '2-3 hours',
        serviceMode: 'Home Visit',
        serviceArea: 'Dhaka North',
        technicianEmail: 'technician3@fixmate.test',
        approvalStatus: 'approved',
        isAvailable: true,
    },
    {
        title: 'Smartphone Charging Port Repair',
        category: 'Smartphone',
        description: 'Loose or damaged charging ports repaired with precision micro-soldering.',
        image: image('photo-1598327105666-5b89351aff97'),
        basePrice: 49,
        estimatedDuration: '1 hour',
        serviceMode: 'Shop Drop-off',
        serviceArea: 'Dhaka North',
        technicianEmail: 'technician1@fixmate.test',
        approvalStatus: 'approved',
        isAvailable: true,
    },
    {
        title: 'Laptop Cooling Fan Replacement',
        category: 'Laptop & PC',
        description: 'Noisy or failed cooling fans replaced to prevent overheating.',
        image: image('photo-1588872657578-7efd1f1555ed'),
        basePrice: 70,
        estimatedDuration: '2 hours',
        serviceMode: 'Shop Drop-off',
        serviceArea: 'Dhaka South',
        technicianEmail: 'technician2@fixmate.test',
        approvalStatus: 'approved',
        isAvailable: true,
    },
    {
        title: 'Washing Machine Belt Replacement',
        category: 'Washing Machine',
        description: 'Worn drive belts replaced so the drum spins smoothly again.',
        image: image('photo-1626806787461-102c1bfaaea1'),
        basePrice: 80,
        estimatedDuration: '2-3 hours',
        serviceMode: 'Home Visit',
        serviceArea: 'Chattogram',
        technicianEmail: 'technician3@fixmate.test',
        approvalStatus: 'approved',
        isAvailable: true,
    },
    {
        title: 'Smartphone Water Damage Diagnosis',
        category: 'Smartphone',
        description: 'Ultrasonic cleaning and corrosion assessment for water damaged devices.',
        image: image('photo-1592750475338-74b7b21085ab'),
        basePrice: 40,
        estimatedDuration: '1 day',
        serviceMode: 'Shop Drop-off',
        serviceArea: 'Dhaka North',
        technicianEmail: 'technician1@fixmate.test',
        approvalStatus: 'pending',
        isAvailable: true,
    },
    {
        title: 'Split AC Installation',
        category: 'AC',
        description: 'Professional split AC mounting, piping and vacuum treatment.',
        image: image('photo-1615874959474-d609969a20ed'),
        basePrice: 120,
        estimatedDuration: '3-4 hours',
        serviceMode: 'Home Visit',
        serviceArea: 'Dhaka South',
        technicianEmail: 'technician2@fixmate.test',
        approvalStatus: 'pending',
        isAvailable: true,
    },
    {
        title: 'TV Wall Mount Installation',
        category: 'TV',
        description: 'Heavy-duty wall bracket fitting and cable management.',
        image: image('photo-1593784991095-a205069470b6'),
        basePrice: 35,
        estimatedDuration: '1 hour',
        serviceMode: 'Home Visit',
        serviceArea: 'Dhaka South',
        technicianEmail: 'technician2@fixmate.test',
        approvalStatus: 'rejected',
        isAvailable: false,
    },
];
function futureDate(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(10, 0, 0, 0);
    return date;
}
async function seedUsers() {
    const usersCollectionHandle = await usersCollection();
    const accounts = (await usersCollectionHandle.db).collection('account');
    await accounts.createIndex({ providerId: 1, accountId: 1 }, { unique: true });
    for (const entry of users) {
        await usersCollectionHandle.updateOne({ email: entry.email }, {
            $setOnInsert: {
                _id: new ObjectId(),
                name: entry.name,
                email: entry.email,
                emailVerified: true,
                phone: entry.phone,
                area: entry.area,
                bio: entry.bio,
                plan: 'free',
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            $set: { role: entry.role },
        }, { upsert: true });
        const user = await usersCollectionHandle.findOne({ email: entry.email });
        if (!user)
            continue;
        const userId = user._id.toHexString();
        const hashed = await hashPassword(entry.password);
        await accounts.updateOne({ providerId: 'credential', accountId: userId }, {
            $setOnInsert: {
                _id: new ObjectId(),
                userId,
                accountId: userId,
                providerId: 'credential',
                password: hashed,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        }, { upsert: true });
    }
}
async function seedServices() {
    const collection = await servicesCollection();
    const technicianNames = new Map((await (await usersCollection()).find().toArray()).map((user) => [user.email, user.name]));
    for (const entry of services) {
        await collection.updateOne({ title: entry.title, technicianEmail: entry.technicianEmail }, {
            $setOnInsert: { _id: new ObjectId(), createdAt: new Date() },
            $set: {
                ...entry,
                technicianName: technicianNames.get(entry.technicianEmail) ?? 'FixMate Technician',
            },
        }, { upsert: true });
    }
}
const bookings = [
    { title: 'Smartphone Screen Replacement', customerEmail: 'customer1@fixmate.test', status: 'requested', paid: false, daysFromNow: 3 },
    { title: 'Laptop & PC OS Installation', customerEmail: 'customer1@fixmate.test', status: 'accepted', paid: false, daysFromNow: 4 },
    { title: 'AC Deep Cleaning Service', customerEmail: 'customer2@fixmate.test', status: 'in-progress', paid: false, daysFromNow: 1 },
    { title: 'Refrigerator Compressor Repair', customerEmail: 'customer1@fixmate.test', status: 'completed', paid: false, daysFromNow: -2, finalAmount: 175 },
    { title: 'TV LED Panel Repair', customerEmail: 'customer2@fixmate.test', status: 'completed', paid: true, daysFromNow: -5, finalAmount: 199 },
    { title: 'Washing Machine Drum Cleaning', customerEmail: 'customer2@fixmate.test', status: 'rejected', paid: false, daysFromNow: 6 },
    { title: 'Home Electrical Wiring Inspection', customerEmail: 'customer1@fixmate.test', status: 'cancelled', paid: false, daysFromNow: 5 },
    { title: 'Smartphone Battery Replacement', customerEmail: 'customer1@fixmate.test', status: 'completed', paid: true, daysFromNow: -1, finalAmount: 55 },
];
async function seedBookingsAndPayments() {
    const services = await (await servicesCollection()).find().toArray();
    const users = await (await usersCollection()).find().toArray();
    const bookingsHandle = await bookingsCollection();
    const payments = await paymentsCollection();
    for (const [index, entry] of bookings.entries()) {
        const service = services.find((item) => item.title === entry.title);
        const customer = users.find((item) => item.email === entry.customerEmail);
        if (!service || !customer)
            continue;
        const filter = {
            serviceId: service._id,
            customerEmail: entry.customerEmail,
            status: entry.status,
        };
        await bookingsHandle.updateOne(filter, {
            $setOnInsert: {
                _id: new ObjectId(),
                createdAt: futureDate(-10 + index),
                problemDescription: 'The device has been malfunctioning and needs a professional inspection and repair.',
                statusHistory: [{ status: entry.status, changedAt: new Date() }],
            },
            $set: {
                serviceTitle: service.title,
                serviceImage: service.image,
                category: service.category,
                basePrice: service.basePrice,
                technicianName: service.technicianName,
                technicianEmail: service.technicianEmail,
                customerName: customer.name,
                customerPhone: customer.phone ?? '+8801800000000',
                address: `${customer.area ?? 'Dhaka'}, Bangladesh`,
                preferredDate: futureDate(entry.daysFromNow),
                finalAmount: entry.finalAmount ?? service.basePrice,
                paymentStatus: entry.paid ? 'paid' : 'unpaid',
            },
        }, { upsert: true });
        if (!entry.paid)
            continue;
        const booking = await bookingsHandle.findOne(filter);
        if (!booking)
            continue;
        await payments.updateOne({ bookingId: booking._id }, {
            $setOnInsert: {
                _id: new ObjectId(),
                stripeSessionId: `cs_test_seed_${index + 1}`,
                transactionId: `pi_seed_${index + 1}`,
                paidAt: new Date(),
            },
            $set: {
                type: 'booking',
                serviceTitle: booking.serviceTitle,
                customerName: booking.customerName,
                customerEmail: booking.customerEmail,
                technicianName: booking.technicianName,
                technicianEmail: booking.technicianEmail,
                amount: booking.finalAmount,
                currency: 'usd',
                paymentStatus: 'paid',
            },
        }, { upsert: true });
    }
}
async function seed() {
    await connectDB();
    await seedUsers();
    await seedServices();
    await seedBookingsAndPayments();
    console.log('[fixmate] seed complete: demo users, services, bookings and payments are ready');
}
seed()
    .catch((error) => {
    console.error('[fixmate] seed failed:', error);
    process.exitCode = 1;
})
    .finally(async () => {
    await closeDB();
});
