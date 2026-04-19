/**
 * escrowController — thin HTTP adapter for admin-scoped escrow ops.
 */

import type { RequestHandler } from 'express';
import { ok, paginated } from '@/utils/respond';
import { parsePagination } from '@/utils/pagination';
import { Unauthorized } from '@/utils/AppError';
import * as escrowService from './escrowService';

export const listEscrows: RequestHandler = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req, { defaultLimit: 20, maxLimit: 100 });
    const result = await escrowService.listEscrows({
      page,
      limit,
      status: req.query.status as escrowService.ListEscrowsQuery['status'],
      buyerId: req.query.buyerId as string | undefined,
      sellerId: req.query.sellerId as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    return paginated(res, result.items, { page, limit, total: result.total });
  } catch (err) {
    next(err);
  }
};

export const getEscrow: RequestHandler = async (req, res, next) => {
  try {
    const escrow = await escrowService.getEscrowById(req.params.id);
    return ok(res, escrow);
  } catch (err) {
    next(err);
  }
};

export const getStats: RequestHandler = async (req, res, next) => {
  try {
    const currency = (req.query.currency as string | undefined) ?? 'NGN';
    const stats = await escrowService.getEscrowStats(currency);
    return ok(res, stats);
  } catch (err) {
    next(err);
  }
};

export const listDisputes: RequestHandler = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req, { defaultLimit: 20, maxLimit: 100 });
    const result = await escrowService.listDisputes({
      page,
      limit,
      status: req.query.status as escrowService.ListDisputesQuery['status'],
    });
    return paginated(res, result.items, { page, limit, total: result.total });
  } catch (err) {
    next(err);
  }
};

export const resolveDispute: RequestHandler = async (req, res, next) => {
  try {
    if (!req.admin) throw Unauthorized('Authentication required');
    const result = await escrowService.resolveDispute({
      disputeId: req.params.id,
      adminId: req.admin.admin.id,
      resolution: req.body.resolution,
      adminNotes: req.body.admin_notes,
    });
    return ok(
      res,
      result,
      `Dispute resolved — funds ${
        result.resolution === 'refund' ? 'refunded to buyer' : 'released to seller'
      }`,
    );
  } catch (err) {
    next(err);
  }
};
