export function sendSuccess(res, data, message, statusCode = 200) {
    return res.status(statusCode).json({
        success: true,
        ...(message ? { message } : {}),
        data,
    });
}
export function sendError(res, statusCode, message, code) {
    return res.status(statusCode).json({
        success: false,
        message,
        ...(code ? { code } : {}),
    });
}
