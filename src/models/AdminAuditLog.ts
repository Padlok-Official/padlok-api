/**
 * AdminAuditLog model — insert-only ledger of consequential admin actions.
 * Fire-and-forget from services; never blocks the response.
 */

import type { PoolClient } from 'pg';
import { pool } from '@/config/database';
import { logger } from '@/utils/logger';

export interface AuditLogInput {
  adminId: string | null;
  action: string; // e.g. 'auth.login.success', 'dispute.resolve'
  entityType?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Record an audit event. Errors are logged but never thrown — audit failure
 * must not take down the calling operation.
 */
export const record = async (input: AuditLogInput, client?: PoolClient): Promise<void> => {
  const runner = client ?? pool;
  try {
    await runner.query(
      `INSERT INTO admin_audit_logs
         (admin_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.adminId,
        input.action,
        input.entityType ?? null,
        input.entityId ?? null,
        input.details ?? {},
        input.ipAddress ?? null,
        input.userAgent ?? null,
      ],
    );
  } catch (err) {
    logger.warn({ err, action: input.action }, 'Audit log insert failed');
  }
};
