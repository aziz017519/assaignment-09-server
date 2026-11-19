import { ObjectId } from 'mongodb';
import { usersCollection } from '../config/db.js';
export async function findUserByEmail(email) {
    const users = await usersCollection();
    return users.findOne({ email: email.trim().toLowerCase() });
}
export async function findUserById(id) {
    const users = await usersCollection();
    const filter = typeof id === 'string' && ObjectId.isValid(id)
        ? { _id: new ObjectId(id) }
        : typeof id === 'string'
            ? { id }
            : { _id: id };
    return users.findOne(filter);
}
