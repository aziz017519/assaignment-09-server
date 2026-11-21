import { toIdString } from './objectId.js';
export function publicUser(user) {
    return {
        id: toIdString(user._id),
        name: user.name,
        email: user.email,
        image: user.image ?? null,
        avatar: user.image ?? null,
        role: user.role,
        emailVerified: Boolean(user.emailVerified),
        phone: user.phone ?? null,
        address: user.address ?? null,
        area: user.area ?? null,
        bio: user.bio ?? null,
        // The plan is a technician-only concept; never leak it to customers.
        ...(user.role === 'technician' ? { plan: user.plan ?? 'free' } : {}),
        createdAt: user.createdAt ?? null,
    };
}
