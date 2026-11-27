/**
 * Optional, idempotent cleanup for databases created before the Pro plan was
 * removed. The Express API no longer reads or writes any of these fields.
 *
 *   npm run cleanup:pro-plan             # dry run: counts only, no writes
 *   npm run cleanup:pro-plan -- --apply  # remove fields and legacy indexes
 *
 * Payment documents are NEVER deleted. Legacy payments with type: 'subscription'
 * are only counted so you can decide what to do with them yourself.
 */
import { closeDB, COLLECTIONS, getDb } from '../config/db.js';

const USER_FIELDS = [
    'plan',
    'planExpiresAt',
    'stripeCustomerId',
    'stripeSubscriptionId',
    'verifiedPro',
    'isPro',
];
const LEGACY_INDEXES = ['stripeInvoiceId_1', 'userId_1_type_1_paidAt_-1'];
const apply = process.argv.includes('--apply');
const hasLegacyField = { $or: USER_FIELDS.map((field) => ({ [field]: { $exists: true } })) };
const unset = Object.fromEntries(USER_FIELDS.map((field) => [field, '']));

async function cleanup() {
    const db = await getDb();
    const summary = {
        mode: apply ? 'apply' : 'dry-run',
        usersWithLegacyFields: {},
        paymentsWithTypeSubscription: 0,
        legacyIndexesFound: [],
    };

    for (const name of [COLLECTIONS.users, COLLECTIONS.user]) {
        const users = db.collection(name);
        const count = await users.countDocuments(hasLegacyField);
        summary.usersWithLegacyFields[name] = count;
        if (apply && count)
            await users.updateMany(hasLegacyField, { $unset: unset });
    }

    const payments = db.collection(COLLECTIONS.payments);
    summary.paymentsWithTypeSubscription = await payments.countDocuments({ type: 'subscription' });

    let existingIndexes = [];
    try {
        existingIndexes = await payments.indexes();
    }
    catch {
        // A database with no payments collection has no legacy indexes either.
    }
    for (const name of LEGACY_INDEXES) {
        if (!existingIndexes.some((index) => index.name === name))
            continue;
        summary.legacyIndexesFound.push(name);
        if (apply)
            await payments.dropIndex(name);
    }

    console.info('[fixmate:cleanup:pro-plan]', JSON.stringify(summary, null, 2));
    if (!apply)
        console.info('[fixmate:cleanup:pro-plan] dry run only; re-run with --apply to write changes');
}

cleanup()
    .catch((error) => {
        console.error('[fixmate:cleanup:pro-plan] failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await closeDB();
    });
