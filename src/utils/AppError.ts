/**
 * Custom error class for controlled error responses.
 * Thrown anywhere in the request pipeline; caught by errorHandler middleware.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly extra?: Record<string, unknown>;
  public readonly isOperational = true;

  constructor(message: string, statusCode = 500, extra?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.extra = extra;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

// Convenience factories for common HTTP errors
export const BadRequest = (msg: string, extra?: Record<string, unknown>) =>
  new AppError(msg, 400, extra);
export const Unauthorized = (msg = 'Unauthorized') => new AppError(msg, 401);
export const Forbidden = (msg = 'Forbidden') => new AppError(msg, 403);
export const NotFound = (msg = 'Not found') => new AppError(msg, 404);
export const Conflict = (msg: string, extra?: Record<string, unknown>) =>
  new AppError(msg, 409, extra);
export const UnprocessableEntity = (msg: string, extra?: Record<string, unknown>) =>
  new AppError(msg, 422, extra);
export const TooManyRequests = (msg = 'Too many requests') => new AppError(msg, 429);
