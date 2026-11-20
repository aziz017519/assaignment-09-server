import { ObjectId } from 'mongodb';
import { authUsersCollection, usersCollection } from '../config/db.js';

// Accounts can be created by the Express signup flow (`users`) or by BetterAuth
// in the Next.js client (`user`). The API must accept both, otherwise a valid
// JWT for a BetterAuth user is rejected as "Invalid or expired token".
async function findUser(filter) {
    const user = await (await usersCollection()).findOne(filter);
    if (user)
        return user;
    return (await authUsersCollection()).findOne(filter);
}

export async function findUserByEmail(email) {
    return findUser({ email: email.trim().toLowerCase() });
}

export async function findUserById(id) {
    const filter = typeof id === 'string' && ObjectId.isValid(id)
        ? { _id: new ObjectId(id) }
        : typeof id === 'string'
            ? { id }
            : { _id: id };
    return findUser(filter);
}
