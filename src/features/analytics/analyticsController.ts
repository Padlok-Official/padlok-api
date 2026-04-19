import type { RequestHandler } from 'express';
import { ok } from '@/utils/respond';
import * as analyticsService from './analyticsService';

const parseCurrency = (q: unknown): string => {
  if (typeof q !== 'string' || q.length !== 3) return 'NGN';
  return q.toUpperCase();
};

const parsePositiveInt = (q: unknown, fallback: number, max: number): number => {
  const n = Number.parseInt(String(q ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
};

export const platformActivity: RequestHandler = async (_req, res, next) => {
  try {
    return ok(res, await analyticsService.getPlatformActivity());
  } catch (err) {
    next(err);
  }
};

export const financialSummary: RequestHandler = async (req, res, next) => {
  try {
    return ok(res, await analyticsService.getFinancialSummary(parseCurrency(req.query.currency)));
  } catch (err) {
    next(err);
  }
};

export const revenueTrend: RequestHandler = async (req, res, next) => {
  try {
    const months = parsePositiveInt(req.query.months, 6, 24);
    return ok(
      res,
      await analyticsService.getRevenueTrend(months, parseCurrency(req.query.currency)),
    );
  } catch (err) {
    next(err);
  }
};

export const seasonalDemand: RequestHandler = async (req, res, next) => {
  try {
    const months = parsePositiveInt(req.query.months, 12, 24);
    return ok(
      res,
      await analyticsService.getSeasonalDemand(months, parseCurrency(req.query.currency)),
    );
  } catch (err) {
    next(err);
  }
};

export const financialForecast: RequestHandler = async (req, res, next) => {
  try {
    return ok(
      res,
      await analyticsService.getFinancialForecast(parseCurrency(req.query.currency)),
    );
  } catch (err) {
    next(err);
  }
};

export const transactionInsights: RequestHandler = async (req, res, next) => {
  try {
    return ok(
      res,
      await analyticsService.getTransactionInsights(parseCurrency(req.query.currency)),
    );
  } catch (err) {
    next(err);
  }
};

export const paymentBehavior: RequestHandler = async (req, res, next) => {
  try {
    return ok(
      res,
      await analyticsService.getPaymentBehavior(parseCurrency(req.query.currency)),
    );
  } catch (err) {
    next(err);
  }
};

export const walletBalanceTrend: RequestHandler = async (req, res, next) => {
  try {
    const days = parsePositiveInt(req.query.days, 7, 90);
    return ok(
      res,
      await analyticsService.getWalletBalanceTrend(days, parseCurrency(req.query.currency)),
    );
  } catch (err) {
    next(err);
  }
};

export const revenueEfficiency: RequestHandler = async (req, res, next) => {
  try {
    return ok(
      res,
      await analyticsService.getRevenueEfficiency(parseCurrency(req.query.currency)),
    );
  } catch (err) {
    next(err);
  }
};
