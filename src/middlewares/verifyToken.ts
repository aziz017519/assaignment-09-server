import jwt, { TokenExpiredError, type JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';
import { sessionsCollection } from '../config/db';
import { findUserById, findUserByEmail } from '../services/user.service';
import { toIdString } from '../utils/objectId';
import { unauthorized } from '../utils/errors';
import { asyncHandler } from './asyncHandler';

function emailFromPayload(payload: JwtPayload): string | undefined {
  const direct = payload.email;
  if (typeof direct === 'string' && direct.includes('@')) return direct;

  const subject = payload.sub;
  if (typeof subject === 'string' && subject.includes('@')) return subject;

  const nested = payload.user;
  if (nested && typeof nested === 'object' && 'email' in nested) {
    const nestedEmail = (nested as { email?: unknown }).email;
    if (typeof nestedEmail === 'string' && nestedEmail.includes('@')) return nestedEmail;
  }
  return undefined;
}

async function emailFromJwt(token: string): Promise<string | undefined> {
  for (const secret of [env.JWT_SECRET, env.BETTER_AUTH_SECRET]) {
    try {
      const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as JwtPayload;
      const email = emailFromPayload(payload);
      if (email) return email;

      if (typeof payload.sub === 'string') {
        const user = await findUserById(payload.sub);
        if (user) return user.email;
      }
    } catch (error) {
      if (error instanceof TokenExpiredError) throw unauthorized('Token has expired');
      // Try the next configured secret.
    }
  }
  return undefined;
}

async function emailFromSessionToken(token: string): Promise<string | undefined> {
  const sessions = await sessionsCollection();
  const session = await sessions.findOne({ token, expiresAt: { $gt: new Date() } });
  if (!session) return undefined;
  const user = await findUserById(session.userId);
  return user?.email;
}

export const verifyToken = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ') || !header.slice(7).trim()) {
    throw unauthorized('Authorization bearer token is required');
  }

  const token = header.slice(7).trim();
  const email = (await emailFromJwt(token)) ?? (await emailFromSessionToken(token));
  if (!email) throw unauthorized('Invalid or expired token');

  const user = await findUserByEmail(email);
  if (!user) throw unauthorized('Invalid or expired token');

  req.user = {
    email: user.email,
    id: toIdString(user._id),
    name: user.name,
    role: user.role,
  };
  req.dbUser = user;
  next();
});
