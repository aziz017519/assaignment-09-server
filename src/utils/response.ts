import type { Response } from 'express';

export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200,
): Response {
  return res.status(statusCode).json({
    success: true,
    ...(message ? { message } : {}),
    data,
  });
}

export function sendError(res: Response, statusCode: number, message: string): Response {
  return res.status(statusCode).json({ success: false, message });
}
