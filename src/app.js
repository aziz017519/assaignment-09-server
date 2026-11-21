import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import routes from './routes/index.js';
import webhookRoutes from './routes/webhook.routes.js';
import { AppError } from './utils/errors.js';
import { sendSuccess } from './utils/response.js';
const normalizeOrigin = (value) => value.replace(/\/$/, '');
const allowedOrigins = new Set([
    env.CLIENT_URL,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
].map(normalizeOrigin));
export function createApp() {
    const app = express();
    app.set('trust proxy', 1);
    app.disable('x-powered-by');
    app.use(helmet());
    app.use(cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.has(normalizeOrigin(origin))) {
                callback(null, true);
                return;
            }
            callback(new AppError(403, 'Origin not allowed by CORS'));
        },
        methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: false,
    }));
    // The webhook needs the untouched raw body for Stripe signature verification.
    // `/api/webhooks/stripe` is the documented path; the singular alias is kept
    // for deployments that already registered it with Stripe.
    app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);
    app.use('/api/webhook', express.raw({ type: 'application/json' }), webhookRoutes);
    app.use(express.json({ limit: '1mb' }));
    app.get('/api/health', (_req, res) => {
        res.status(200).json({ success: true, message: 'API is running' });
    });
    app.use('/api', rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 300,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { success: false, message: 'Too many requests, please try again later' },
    }));
    app.get('/', (_req, res) => {
        sendSuccess(res, { service: 'FixMate API', version: '1.0.0' }, 'FixMate server is running');
    });
    app.use('/api', routes);
    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
}
export const app = createApp();
