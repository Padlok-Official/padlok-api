/**
 * Redis cache for authenticated admin data.
 *
 * Why: the auth middleware runs on every protected request. Hitting
 * Postgres every time is wasteful. We cache the {admin, role, permissions}
 * tuple for 5 minutes, keyed by admin ID. Invalidated on logout, password
 * change, role change, or status change.
 *
 * Fallback: if Redis is down, callers fetch from Postgres directly — the
 * app stays functional, just slower.
 */

import { redis } from '@/config/redis';
import { logger } from './logger';
import type { AdminWithPermissions } from '@/types/admin';

const TTL_SECONDS = 5 * 60; // 5 minutes
const keyFor = (adminId: string) => `admin:${adminId}`;

export const getCachedAdmin = async (
  adminId: string,
): Promise<AdminWithPermissions | null> => {
  try {
    const raw = await redis.get(keyFor(adminId));
    if (!raw) return null;
    // Dates need revival: JSON.parse gives strings back
    const parsed = JSON.parse(raw) as AdminWithPermissions;
    return parsed;
  } catch (err) {
    logger.debug({ err, adminId }, 'adminCache.get failed — falling back to DB');
    return null;
  }
};

export const setCachedAdmin = async (
  adminId: string,
  value: AdminWithPermissions,
): Promise<void> => {
  try {
    await redis.setex(keyFor(adminId), TTL_SECONDS, JSON.stringify(value));
  } catch (err) {
    logger.debug({ err, adminId }, 'adminCache.set failed — ignoring');
  }
};

export const invalidateCachedAdmin = async (adminId: string): Promise<void> => {
  try {
    await redis.del(keyFor(adminId));
  } catch (err) {
    logger.debug({ err, adminId }, 'adminCache.invalidate failed — ignoring');
  }
};
