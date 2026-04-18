/**
 * Augment Express.Request to carry the authenticated admin after the
 * auth middleware runs. This is a compile-time-only file.
 */

import type { AdminWithPermissions } from './admin';

declare global {
  namespace Express {
    interface Request {
      admin?: AdminWithPermissions;
      // Set of permission keys for O(1) requirePermission() checks.
      adminPermissions?: Set<string>;
    }
  }
}

export {};
