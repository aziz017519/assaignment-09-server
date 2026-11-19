/** Only customers and technicians may self-register; every other value falls back to customer. */
export function normalizeSignupRole(role) {
    return role === 'technician' ? 'technician' : 'customer';
}
