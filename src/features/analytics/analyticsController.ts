import type { RequestHandler } from 'express';
import { ok } from '@/utils/respond';
import * as analyticsService from './analyticsService';

export const platformActivity: RequestHandler = async (_req, res, next) => {
  try {
    const data = await analyticsService.getPlatformActivity();
    return ok(res, data);
  } catch (err) {
    next(err);
  }
};
