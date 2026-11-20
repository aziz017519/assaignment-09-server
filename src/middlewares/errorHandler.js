import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { sendError } from '../utils/response.js';
export const notFoundHandler = (req, res) => {
    sendError(res, 404, `Route ${req.method} ${req.originalUrl} not found`);
};
export const errorHandler = (error, _req, res, _next) => {
    if (res.headersSent)
        return;
    if (error instanceof ZodError) {
        const message = error.issues.map((issue) => issue.message).join('; ');
        sendError(res, 400, message || 'Invalid request');
        return;
    }
    if (error instanceof AppError) {
        if (error.code) {
            sendError(res, error.statusCode, error.message, error.code);
        } else {
            sendError(res, error.statusCode, error.message);
        }
        return;
    }
    if (error instanceof jwt.TokenExpiredError) {
        sendError(res, 401, 'Token has expired');
        return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
        sendError(res, 401, 'Invalid token');
        return;
    }
    if (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000) {
        sendError(res, 409, 'A record with these unique values already exists');
        return;
    }
    if (env.NODE_ENV !== 'test') {
        console.error('[fixmate] unhandled error:', error);
    }
    sendError(res, 500, 'Internal server error');
};
