import { ObjectId } from 'mongodb';
import { authUsersCollection, usersCollection } from '../config/db.js';

// Accounts can be created by the Express signup flow (`users`) or by BetterAuth
// in the Next.js client (`user`). The API must accept both, otherwise a valid
// JWT for a BetterAuth user is rejected as "Invalid or expired token".
export function userFilterById(id) {
    return typeof id === 'string' && ObjectId.isValid(id)
        ? { _id: new ObjectId(id) }
        : typeof id === 'string'
            ? { id }
            : { _id: id };
}
async function findUserStore(filter) {
    const users = await usersCollection();
    const user = await users.findOne(filter);
    if (user)
        return { user, collection: users };
    const authUsers = await authUsersCollection();
    const authUser = await authUsers.findOne(filter);
    return authUser ? { user: authUser, collection: authUsers } : null;
}
async function findUser(filter) {
    return (await findUserStore(filter))?.user ?? null;
}

export async function findUserByEmail(email) {
    return findUser({ email: email.trim().toLowerCase() });
}

export async function findUserById(id) {
    return findUser(userFilterById(id));
}

// Account lookups must work in either store: Express users or BetterAuth users.
export async function findUserStoreByEmail(email) {
    return findUserStore({ email: email.trim().toLowerCase() });
}

export async function findUserStoreById(id) {
    return findUserStore(userFilterById(id));
}

export async function updateUserById(id, update) {
    const store = await findUserStoreById(id);
    if (!store)
        return null;
    await store.collection.updateOne({ _id: store.user._id }, { $set: update });
    return store.collection.findOne({ _id: store.user._id });
}
