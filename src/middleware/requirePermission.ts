/**
 * requirePermission middleware — gates an endpoint on a specific permission.
 *
 * Usage:
 *   router.delete('/disputes/:id', authenticate, requirePermission('resolve_disputes'), handler);
 *
 * Accepts either a single key or an array (pass all to require ALL).
 * Always runs AFTER `authenticate` so req.adminPermissions is populated.
 *
 * "Super Admin" bypass — handled naturally because the seed grants that
 * role every permission, so their Set contains all keys.
 */

import type { RequestHandler } from 'express';
import { Forbidden, Unauthorized } from '@/utils/AppError';

type PermissionInput = string | string[];

export const requirePermission =
  (required: PermissionInput): RequestHandler =>
  (req, _res, next) => {
    if (!req.admin || !req.adminPermissions) {
      return next(Unauthorized('Authentication required'));
    }

    const needed = Array.isArray(required) ? required : [required];
    const missing = needed.filter((key) => !req.adminPermissions!.has(key));
    if (missing.length > 0) {
      return next(
        Forbidden(
          needed.length === 1
            ? `Missing permission: ${missing[0]}`
            : `Missing permissions: ${missing.join(', ')}`,
        ),
      );
    }

    next();
  };

/**
 * Pass if ANY of the permissions are held.
 *   requireAnyPermission(['view_disputes', 'resolve_disputes'])
 */
export const requireAnyPermission =
  (choices: string[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.admin || !req.adminPermissions) {
      return next(Unauthorized('Authentication required'));
    }

    const ok = choices.some((key) => req.adminPermissions!.has(key));
    if (!ok) {
      return next(Forbidden(`Missing any of: ${choices.join(', ')}`));
    }
    next();
  };
