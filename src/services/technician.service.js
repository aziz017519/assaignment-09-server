import {
    bookingsCollection,
    paymentsCollection,
    servicesCollection,
} from '../config/db.js';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BOOKING_STATUSES = ['requested', 'accepted', 'rejected', 'in-progress', 'completed', 'cancelled'];
const CHART_MONTHS = 6;

function chartStartDate() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (CHART_MONTHS - 1), 1));
}

function monthKey(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function buildMonthlyRows(rows) {
    const counts = new Map(rows.map((row) => [row._id, row]));
    const now = new Date();
    return Array.from({ length: CHART_MONTHS }, (_, index) => {
        const month = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth() - (CHART_MONTHS - 1 - index),
            1,
        ));
        const key = monthKey(month);
        const row = counts.get(key) ?? {};
        return {
            label: MONTH_LABELS[month.getUTCMonth()],
            requested: row.requested ?? 0,
            completed: row.completed ?? 0,
            cancelled: row.cancelled ?? 0,
        };
    });
}

export async function getTechnicianStats(email) {
    const technicianEmail = email.toLowerCase();
    const start = chartStartDate();

    const [serviceRows, bookingRows, earningsRows] = await Promise.all([
        (await servicesCollection()).aggregate([
            { $match: { technicianEmail } },
            { $group: { _id: '$approvalStatus', count: { $sum: 1 } } },
        ]).toArray(),
        (await bookingsCollection()).aggregate([
            { $match: { technicianEmail } },
            {
                $facet: {
                    byStatus: [
                        { $group: { _id: '$status', count: { $sum: 1 } } },
                    ],
                    monthly: [
                        { $match: { createdAt: { $gte: start } } },
                        {
                            $project: {
                                month: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'UTC' } },
                                status: '$status',
                            },
                        },
                        {
                            $group: {
                                _id: { month: '$month', status: '$status' },
                                count: { $sum: 1 },
                            },
                        },
                        {
                            $group: {
                                _id: '$_id.month',
                                requested: { $sum: { $cond: [{ $eq: ['$_id.status', 'requested'] }, '$count', 0] } },
                                completed: { $sum: { $cond: [{ $eq: ['$_id.status', 'completed'] }, '$count', 0] } },
                                cancelled: { $sum: { $cond: [{ $eq: ['$_id.status', 'cancelled'] }, '$count', 0] } },
                            },
                        },
                    ],
                },
            },
        ]).toArray(),
        (await paymentsCollection()).aggregate([
            {
                $match: {
                    technicianEmail,
                    $or: [
                        { paymentStatus: 'paid' },
                        { status: 'paid' },
                    ],
                    type: { $in: ['booking', null] },
                },
            },
            { $group: { _id: null, total: { $sum: { $ifNull: ['$amount', 0] } } } },
        ]).toArray(),
    ]);

    const serviceCounts = new Map(serviceRows.map((row) => [row._id, row.count]));
    const totalServices = serviceRows.reduce((sum, row) => sum + row.count, 0);
    const statusCounts = new Map(
        (bookingRows[0]?.byStatus ?? []).map((row) => [row._id, row.count]),
    );
    const countFor = (status) => statusCounts.get(status) ?? 0;

    return {
        totalServices,
        approvedServices: serviceCounts.get('approved') ?? 0,
        pendingServices: serviceCounts.get('pending') ?? 0,
        pendingRequests: countFor('requested'),
        acceptedRequests: countFor('accepted'),
        completedRequests: countFor('completed'),
        cancelledRequests: countFor('cancelled'),
        totalEarnings: Number((earningsRows[0]?.total ?? 0).toFixed(2)),
        requestsByStatus: BOOKING_STATUSES.map((status) => ({
            status,
            count: countFor(status),
        })).filter((item) => item.count > 0),
        requestsByMonth: buildMonthlyRows(bookingRows[0]?.monthly ?? []),
    };
}
