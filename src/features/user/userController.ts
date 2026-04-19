import type { RequestHandler } from 'express';
import { ok, paginated } from '@/utils/respond';
import { parsePagination } from '@/utils/pagination';
import { BadRequest } from '@/utils/AppError';
import * as userService from './userService';

export const list: RequestHandler = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req, { defaultLimit: 20, maxLimit: 100 });
    const minFlags = req.query.minFlags ? Number(req.query.minFlags) : undefined;
    const result = await userService.listUsers({
      page,
      limit,
      search: req.query.search as string | undefined,
      status: req.query.status as userService.ListUsersQuery['status'] | undefined,
      minFlags: Number.isFinite(minFlags) ? minFlags : undefined,
    });
    return paginated(res, result.items, { page, limit, total: result.total });
  } catch (err) {
    next(err);
  }
};

export const getOne: RequestHandler = async (req, res, next) => {
  try {
    return ok(res, await userService.getUserById(req.params.id));
  } catch (err) {
    next(err);
  }
};

export const activity: RequestHandler = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 50), 200);
    return ok(res, await userService.getUserActivity(req.params.id, limit));
  } catch (err) {
    next(err);
  }
};

export const transactions: RequestHandler = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req, { defaultLimit: 20, maxLimit: 100 });
    const result = await userService.getUserTransactions(req.params.id, page, limit);
    return paginated(res, result.items, { page, limit, total: result.total });
  } catch (err) {
    next(err);
  }
};

export const disputes: RequestHandler = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req, { defaultLimit: 20, maxLimit: 100 });
    const result = await userService.getUserDisputes(req.params.id, page, limit);
    return paginated(res, result.items, { page, limit, total: result.total });
  } catch (err) {
    next(err);
  }
};

export const setStatus: RequestHandler = async (req, res, next) => {
  try {
    const status = req.body.status as 'active' | 'inactive';
    if (status !== 'active' && status !== 'inactive') {
      throw BadRequest('status must be "active" or "inactive"');
    }
    const updated = await userService.setUserActive(req.params.id, status === 'active');
    return ok(res, updated, `User set to ${status}`);
  } catch (err) {
    next(err);
  }
};
