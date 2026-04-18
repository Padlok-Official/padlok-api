import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '@/utils/AppError';
import { fail } from '@/utils/respond';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

/**
 * 404 handler — must be registered AFTER all routes.
 */
export const notFoundHandler: RequestHandler = (req, res) => {
  fail(res, 404, `Route not found: ${req.method} ${req.originalUrl}`);
};

/**
 * Global error handler — must be registered LAST.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Known operational error thrown by our code
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.originalUrl }, 'AppError (5xx)');
    }
    return fail(res, err.statusCode, err.message, err.extra);
  }

  // Body parser errors (malformed JSON, payload too large)
  const errorWithStatus = err as { statusCode?: number; status?: number; type?: string };
  if (errorWithStatus?.type === 'entity.parse.failed') {
    return fail(res, 400, 'Invalid JSON payload');
  }
  if (errorWithStatus?.type === 'entity.too.large') {
    return fail(res, 413, 'Payload too large');
  }

  // Unknown / unhandled
  logger.error({ err, path: req.originalUrl }, 'Unhandled error');
  return fail(
    res,
    500,
    env.isProd ? 'Internal server error' : (err as Error)?.message ?? 'Internal server error',
  );
};
