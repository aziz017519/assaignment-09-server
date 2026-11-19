import { ObjectId } from 'mongodb';
import { badRequest } from './errors.js';
export function parseObjectId(value, label = 'id') {
    if (typeof value !== 'string' || !ObjectId.isValid(value)) {
        throw badRequest(`Invalid ${label}`);
    }
    return new ObjectId(value);
}
export function toIdString(value) {
    if (value === undefined || value === null)
        return undefined;
    return typeof value === 'string' ? value : value.toHexString();
}
