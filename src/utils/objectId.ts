import { ObjectId } from 'mongodb';
import { badRequest } from './errors';

export function parseObjectId(value: unknown, label = 'id'): ObjectId {
  if (typeof value !== 'string' || !ObjectId.isValid(value)) {
    throw badRequest(`Invalid ${label}`);
  }
  return new ObjectId(value);
}

export function toIdString(value: ObjectId | string | undefined | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? value : value.toHexString();
}
