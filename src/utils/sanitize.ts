import type { UserDoc } from '../types/models';
import { toIdString } from './objectId';

export function publicUser(user: UserDoc) {
  return {
    id: toIdString(user._id),
    name: user.name,
    email: user.email,
    image: user.image ?? null,
    role: user.role,
    phone: user.phone ?? null,
    area: user.area ?? null,
    bio: user.bio ?? null,
    plan: user.plan ?? 'free',
    createdAt: user.createdAt ?? null,
  };
}
