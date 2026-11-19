import { badRequest } from './errors.js';
export const ACTIVE_BOOKING_STATUSES = [
    'requested',
    'accepted',
    'in-progress',
];
export const FINAL_BOOKING_STATUSES = ['rejected', 'cancelled', 'completed'];
const TRANSITIONS = [
    { next: 'accepted', actor: 'technician' },
    { next: 'rejected', actor: 'technician' },
    { next: 'cancelled', actor: 'customer' },
    { next: 'in-progress', actor: 'technician' },
    { next: 'completed', actor: 'technician', requiresFinalAmount: true },
];
const CURRENT_STATUSES = ['requested', 'accepted', 'in-progress'];
export function findTransition(current, next) {
    if (!CURRENT_STATUSES.includes(current))
        return undefined;
    return TRANSITIONS.find((transition) => transition.next === next &&
        (current === 'requested'
            ? ['accepted', 'rejected', 'cancelled'].includes(next)
            : current === 'accepted'
                ? next === 'in-progress'
                : next === 'completed'));
}
export function assertStatusTransition(current, next, actor) {
    const transition = findTransition(current, next);
    if (!transition || transition.actor !== actor) {
        throw badRequest(`Invalid status transition: ${current} -> ${next}`);
    }
    return transition;
}
export function isActiveStatus(status) {
    return ACTIVE_BOOKING_STATUSES.includes(status);
}
