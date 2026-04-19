import type { RequestHandler } from 'express';
import { ok, paginated } from '@/utils/respond';
import { parsePagination } from '@/utils/pagination';
import * as walletService from './walletService';

export const listTransactions: RequestHandler = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req, { defaultLimit: 20, maxLimit: 100 });
    const result = await walletService.listWalletTransactions({
      page,
      limit,
      type: req.query.type as walletService.ListWalletTxQuery['type'],
      status: req.query.status as walletService.ListWalletTxQuery['status'],
      userId: req.query.userId as string | undefined,
      walletId: req.query.walletId as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    return paginated(res, result.items, { page, limit, total: result.total });
  } catch (err) {
    next(err);
  }
};

export const getTransaction: RequestHandler = async (req, res, next) => {
  try {
    const tx = await walletService.getWalletTransactionById(req.params.id);
    return ok(res, tx);
  } catch (err) {
    next(err);
  }
};

export const getStats: RequestHandler = async (req, res, next) => {
  try {
    const currency = (req.query.currency as string | undefined) ?? 'NGN';
    const stats = await walletService.getWalletStats(currency);
    return ok(res, stats);
  } catch (err) {
    next(err);
  }
};
