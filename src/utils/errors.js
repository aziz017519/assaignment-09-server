export class AppError extends Error {
    statusCode;
    expose;
    code;
    constructor(statusCode, message, expose = true, code = null) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.expose = expose;
        this.code = code;
        Error.captureStackTrace?.(this, AppError);
    }
}
export const badRequest = (message) => new AppError(400, message);
export const unauthorized = (message = 'Unauthorized') => new AppError(401, message);
export const forbidden = (message = 'Forbidden: you do not have access to this resource', code = null) => new AppError(403, message, true, code);
export const notFound = (message = 'Resource not found') => new AppError(404, message);
export const conflict = (message) => new AppError(409, message);
