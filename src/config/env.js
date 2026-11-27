import 'dotenv/config';
import { z } from 'zod';
const optionalSecret = z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), z.string().trim().min(1).optional());
const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    MONGODB_URI: z.string().trim().min(1, 'MONGODB_URI is required'),
    DB_NAME: z.string().trim().min(1).default('fixmate'),
    JWT_SECRET: z.string().trim().min(16, 'JWT_SECRET must be at least 16 characters'),
    BETTER_AUTH_SECRET: z
        .string()
        .trim()
        .min(16, 'BETTER_AUTH_SECRET must be at least 16 characters'),
    CLIENT_URL: z.url().default('http://localhost:3000'),
    // Used for Stripe Checkout success/cancel URLs. NEXT_PUBLIC_APP_URL is shared
    // with the client so local and deployed URLs stay in sync.
    NEXT_PUBLIC_APP_URL: z.url().default('http://localhost:3000'),
    STRIPE_SECRET_KEY: optionalSecret,
    STRIPE_WEBHOOK_SECRET: optionalSecret,
    IMGBB_API_KEY: optionalSecret,
    ADMIN_EMAIL: z.email().default('admin@fixmate.test'),
    ADMIN_PASSWORD: z.string().min(8).default('Admin@12345'),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    const details = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
        .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
}
export const env = parsed.data;
export function requireStripeConfig() {
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
        throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.');
    }
    return {
        secretKey: env.STRIPE_SECRET_KEY,
        webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    };
}
export function getAppUrl() {
    return env.NEXT_PUBLIC_APP_URL || env.CLIENT_URL;
}
