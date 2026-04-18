import type { Response } from 'express';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Success response with optional data and message.
 *   ok(res, { user })
 *   ok(res, { user }, 'User created', 201)
 */
export const ok = <T>(
  res: Response,
  data?: T,
  message?: string,
  statusCode = 200,
): Response =>
  res.status(statusCode).json({
    success: true,
    message: message ?? 'OK',
    data,
  });

/**
 * Failure response.
 *   fail(res, 404, 'User not found')
 */
export const fail = (
  res: Response,
  statusCode: number,
  message: string,
  extra?: Record<string, unknown>,
): Response =>
  res.status(statusCode).json({
    success: false,
    message,
    ...(extra && { ...extra }),
  });

/**
 * Paginated list response.
 *   paginated(res, items, { page: 1, limit: 20, total: 153 })
 */
export const paginated = <T>(
  res: Response,
  items: T[],
  meta: Omit<PaginationMeta, 'totalPages'>,
): Response => {
  const totalPages = Math.max(1, Math.ceil(meta.total / meta.limit));
  return res.status(200).json({
    success: true,
    data: items,
    pagination: { ...meta, totalPages },
  });
};
