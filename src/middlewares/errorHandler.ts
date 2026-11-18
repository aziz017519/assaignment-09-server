import type { ErrorRequestHandler, RequestHandler } from 'express';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { sendError } from '../utils/response';

export const notFoundHandler: RequestHandler = (req, res) => {
  sendError(res, 404, `Route ${req.method} ${req.originalUrl} not found`);
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) return;

  if (error instanceof ZodError) {
    const message = error.issues.map((issue) => issue.message).join('; ');
    sendError(res, 400, message || 'Invalid request');
    return;
  }

  if (error instanceof AppError) {
    sendError(res, error.statusCode, error.message);
    return;
  }

  if (error instanceof TokenExpiredError) {
    sendError(res, 401, 'Token has expired');
    return;
  }

  if (error instanceof JsonWebTokenError) {
    sendError(res, 401, 'Invalid token');
    return;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  ) {
    sendError(res, 409, 'A record with these unique values already exists');
    return;
  }

  if (env.NODE_ENV !== 'test') {
    console.error('[fixmate] unhandled error:', error);
  }
  sendError(res, 500, 'Internal server error');
};
