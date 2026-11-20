import { toIdString } from './objectId.js';
export function publicUser(user) {
    return {
        id: toIdString(user._id),
        name: user.name,
        email: user.email,
        image: user.image ?? null,
        role: user.role,
        phone: user.phone ?? null,
        area: user.area ?? null,
        bio: user.bio ?? null,
        // The plan is a technician-only concept; never leak it to customers.
        ...(user.role === 'technician' ? { plan: user.plan ?? 'free' } : {}),
        createdAt: user.createdAt ?? null,
    };
}
