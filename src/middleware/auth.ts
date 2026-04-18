/**
 * authenticate middleware — verifies the Bearer access token and loads the
 * admin (from Redis cache or Postgres). Attaches `req.admin` and
 * `req.adminPermissions` (a Set<string> for O(1) requirePermission checks).
 *
 * Must be applied to every protected route. Does NOT check any permission —
 * that's requirePermission's job.
 *
 * Speed: cache hit → 1 Redis round-trip (~1ms). Cache miss → 1 Postgres
 * query (~5ms) + cache set.
 * Security: rejects suspended/deleted admins even with valid JWT.
 */

import type { RequestHandler } from 'express';
import { verifyToken } from '@/utils/jwt';
import { Unauthorized, Forbidden } from '@/utils/AppError';
import {
  getCachedAdmin,
  setCachedAdmin,
} from '@/utils/adminCache';
import * as AdminModel from '@/models/Admin';

const extractBearerToken = (header: string | undefined): string | null => {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token.trim();
};

export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) throw Unauthorized('Authentication required');

    const payload = verifyToken(token, 'access');

    // Cache-first lookup
    let awp = await getCachedAdmin(payload.adminId);
    if (!awp) {
      awp = await AdminModel.findByIdWithPermissions(payload.adminId);
      if (!awp) throw Unauthorized('Account no longer exists');
      await setCachedAdmin(payload.adminId, awp);
    }

    if (awp.admin.deleted_at) throw Unauthorized('Account no longer exists');
    if (awp.admin.status === 'suspended') throw Forbidden('Account is suspended');

    req.admin = awp;
    req.adminPermissions = new Set(awp.permissions);
    next();
  } catch (err) {
    next(err);
  }
};
