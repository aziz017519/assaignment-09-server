import type { ObjectId } from 'mongodb';
import type { UserDoc, UserRole } from './models';

declare global {
  namespace Express {
    interface Request {
      user?: {
        email: string;
        id?: string | ObjectId;
        name?: string;
        role?: UserRole;
      };
      dbUser?: UserDoc;
    }
  }
}

export {};
