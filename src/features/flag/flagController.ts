import type { RequestHandler } from 'express';
import { ok, paginated } from '@/utils/respond';
import { parsePagination } from '@/utils/pagination';
import { Unauthorized } from '@/utils/AppError';
import * as flagService from './flagService';

export const listFlags: RequestHandler = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req, { defaultLimit: 20, maxLimit: 100 });
    const result = await flagService.listFlags({
      page,
      limit,
      severity: req.query.severity as flagService.FlagSeverity | undefined,
      userId: req.query.userId as string | undefined,
      resolved: req.query.resolved === undefined ? undefined : req.query.resolved === 'true',
    });
    return paginated(res, result.items, { page, limit, total: result.total });
  } catch (err) {
    next(err);
  }
};

export const stats: RequestHandler = async (_req, res, next) => {
  try {
    return ok(res, await flagService.getFlagStats());
  } catch (err) {
    next(err);
  }
};

export const createFlag: RequestHandler = async (req, res, next) => {
  try {
    if (!req.admin) throw Unauthorized('Authentication required');
    const flag = await flagService.createFlag({
      userId: req.body.userId,
      flaggedBy: req.admin.admin.id,
      reason: req.body.reason,
      severity: req.body.severity,
      category: req.body.category,
      relatedDisputeId: req.body.relatedDisputeId,
      relatedTransactionId: req.body.relatedTransactionId,
      notes: req.body.notes,
    });
    return ok(res, flag, 'Flag applied', 201);
  } catch (err) {
    next(err);
  }
};

export const getFlag: RequestHandler = async (req, res, next) => {
  try {
    return ok(res, await flagService.getFlagById(req.params.id));
  } catch (err) {
    next(err);
  }
};

export const resolveFlag: RequestHandler = async (req, res, next) => {
  try {
    if (!req.admin) throw Unauthorized('Authentication required');
    const flag = await flagService.resolveFlag(
      req.params.id,
      req.admin.admin.id,
      req.body.resolutionNotes,
    );
    return ok(res, flag, 'Flag resolved');
  } catch (err) {
    next(err);
  }
};

export const listAlerts: RequestHandler = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req, { defaultLimit: 20, maxLimit: 100 });
    const result = await flagService.listAlerts({
      page,
      limit,
      severity: req.query.severity as flagService.FlagSeverity | undefined,
      source: req.query.source as string | undefined,
      acknowledged:
        req.query.acknowledged === undefined ? undefined : req.query.acknowledged === 'true',
    });
    return paginated(res, result.items, { page, limit, total: result.total });
  } catch (err) {
    next(err);
  }
};

export const acknowledgeAlert: RequestHandler = async (req, res, next) => {
  try {
    await flagService.acknowledgeAlert(req.params.id);
    return ok(res, null, 'Alert acknowledged');
  } catch (err) {
    next(err);
  }
};
