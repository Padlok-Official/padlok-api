import type { Request } from 'express';

export interface PaginationInput {
  page: number;
  limit: number;
  offset: number;
}

/**
 * Parse `page` and `limit` query params with sane defaults + caps.
 *   parsePagination(req, { defaultLimit: 20, maxLimit: 100 })
 */
export const parsePagination = (
  req: Request,
  options?: { defaultLimit?: number; maxLimit?: number },
): PaginationInput => {
  const defaultLimit = options?.defaultLimit ?? 20;
  const maxLimit = options?.maxLimit ?? 100;

  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const rawLimit = parseInt(String(req.query.limit ?? defaultLimit), 10) || defaultLimit;
  const limit = Math.min(Math.max(1, rawLimit), maxLimit);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
};
