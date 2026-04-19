/**
 * flagService — admin-applied flags on users + derived risk alerts.
 * Writes to tables owned by padlok-api (see migration 008_create_user_flags).
 */

import { pool } from '@/config/database';
import { NotFound } from '@/utils/AppError';

export type FlagSeverity = 'critical' | 'warning' | 'info';

export interface FlagRow {
  id: string;
  user_id: string;
  user_name: string | null;
  flagged_by: string;
  flagged_by_name: string | null;
  reason: string;
  severity: FlagSeverity;
  category: string | null;
  related_dispute_id: string | null;
  related_transaction_id: string | null;
  notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  created_at: string;
}

const FLAG_SELECT = `
  f.id, f.user_id, u.name AS user_name,
  f.flagged_by, a.name AS flagged_by_name,
  f.reason, f.severity, f.category,
  f.related_dispute_id, f.related_transaction_id,
  f.notes, f.resolved_at, f.resolved_by, f.resolution_notes, f.created_at
`;

export interface ListFlagsQuery {
  page: number;
  limit: number;
  severity?: FlagSeverity;
  userId?: string;
  resolved?: boolean;
}

export const listFlags = async (
  query: ListFlagsQuery,
): Promise<{ items: FlagRow[]; total: number }> => {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (query.severity) {
    conditions.push(`f.severity = $${idx++}`);
    values.push(query.severity);
  }
  if (query.userId) {
    conditions.push(`f.user_id = $${idx++}`);
    values.push(query.userId);
  }
  if (query.resolved === true) conditions.push(`f.resolved_at IS NOT NULL`);
  if (query.resolved === false) conditions.push(`f.resolved_at IS NULL`);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitParam = `$${idx++}`;
  const offsetParam = `$${idx++}`;
  values.push(query.limit, (query.page - 1) * query.limit);

  const [rowsRes, countRes] = await Promise.all([
    pool.query<FlagRow>(
      `SELECT ${FLAG_SELECT}
       FROM user_flags f
       LEFT JOIN users u ON u.id = f.user_id
       LEFT JOIN admins a ON a.id = f.flagged_by
       ${where}
       ORDER BY f.created_at DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      values,
    ),
    pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM user_flags f ${where}`,
      values.slice(0, idx - 3),
    ),
  ]);
  return { items: rowsRes.rows, total: Number(countRes.rows[0]?.total ?? 0) };
};

export interface FlagStats {
  flagged_users: number;
  active_alerts: number;
  accounts_frozen: number;
  accounts_banned: number;
  by_severity: Record<FlagSeverity, number>;
}

export const getFlagStats = async (): Promise<FlagStats> => {
  const [flagRes, alertRes, userRes] = await Promise.all([
    pool.query<{ severity: FlagSeverity; count: string; distinct_users: string }>(
      `SELECT severity, COUNT(*)::text AS count,
              COUNT(DISTINCT user_id)::text AS distinct_users
       FROM user_flags
       WHERE resolved_at IS NULL
       GROUP BY severity`,
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM risk_alerts WHERE acknowledged_at IS NULL`,
    ),
    pool.query<{ frozen: string; banned: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE u.is_active = FALSE)::text AS frozen,
         COUNT(*) FILTER (WHERE u.is_active = FALSE AND (
           SELECT MAX(severity::text) FROM user_flags f
           WHERE f.user_id = u.id AND f.resolved_at IS NULL
         ) = 'critical')::text AS banned
       FROM users u
       WHERE EXISTS (
         SELECT 1 FROM user_flags f WHERE f.user_id = u.id AND f.resolved_at IS NULL
       )`,
    ),
  ]);

  const bySeverity: Record<FlagSeverity, number> = { critical: 0, warning: 0, info: 0 };
  let flaggedUsers = 0;
  for (const row of flagRes.rows) {
    bySeverity[row.severity] = Number(row.count);
    flaggedUsers += Number(row.distinct_users);
  }
  return {
    flagged_users: flaggedUsers,
    active_alerts: Number(alertRes.rows[0]?.count ?? 0),
    accounts_frozen: Number(userRes.rows[0]?.frozen ?? 0),
    accounts_banned: Number(userRes.rows[0]?.banned ?? 0),
    by_severity: bySeverity,
  };
};

export interface CreateFlagInput {
  userId: string;
  flaggedBy: string;
  reason: string;
  severity?: FlagSeverity;
  category?: string;
  relatedDisputeId?: string;
  relatedTransactionId?: string;
  notes?: string;
}

export const createFlag = async (input: CreateFlagInput): Promise<FlagRow> => {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO user_flags
       (user_id, flagged_by, reason, severity, category, related_dispute_id, related_transaction_id, notes)
     VALUES ($1, $2, $3, $4::user_flag_severity, $5, $6, $7, $8)
     RETURNING id`,
    [
      input.userId,
      input.flaggedBy,
      input.reason,
      input.severity ?? 'warning',
      input.category ?? null,
      input.relatedDisputeId ?? null,
      input.relatedTransactionId ?? null,
      input.notes ?? null,
    ],
  );
  return getFlagById(rows[0].id);
};

export const getFlagById = async (id: string): Promise<FlagRow> => {
  const { rows } = await pool.query<FlagRow>(
    `SELECT ${FLAG_SELECT}
     FROM user_flags f
     LEFT JOIN users u ON u.id = f.user_id
     LEFT JOIN admins a ON a.id = f.flagged_by
     WHERE f.id = $1
     LIMIT 1`,
    [id],
  );
  const flag = rows[0];
  if (!flag) throw NotFound('Flag not found');
  return flag;
};

export const resolveFlag = async (
  id: string,
  resolvedBy: string,
  resolutionNotes?: string,
): Promise<FlagRow> => {
  const { rowCount } = await pool.query(
    `UPDATE user_flags
     SET resolved_at = NOW(), resolved_by = $2, resolution_notes = $3
     WHERE id = $1 AND resolved_at IS NULL`,
    [id, resolvedBy, resolutionNotes ?? null],
  );
  if (!rowCount) throw NotFound('Flag not found or already resolved');
  return getFlagById(id);
};

// ---------------- Risk alerts ----------------

export interface RiskAlertRow {
  id: string;
  user_id: string | null;
  user_name: string | null;
  title: string;
  description: string;
  severity: FlagSeverity;
  source: string;
  metadata: Record<string, unknown> | null;
  acknowledged_at: string | null;
  created_at: string;
}

export interface ListAlertsQuery {
  page: number;
  limit: number;
  severity?: FlagSeverity;
  source?: string;
  acknowledged?: boolean;
}

export const listAlerts = async (
  query: ListAlertsQuery,
): Promise<{ items: RiskAlertRow[]; total: number }> => {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (query.severity) {
    conditions.push(`r.severity = $${idx++}`);
    values.push(query.severity);
  }
  if (query.source) {
    conditions.push(`r.source = $${idx++}`);
    values.push(query.source);
  }
  if (query.acknowledged === true) conditions.push(`r.acknowledged_at IS NOT NULL`);
  if (query.acknowledged === false) conditions.push(`r.acknowledged_at IS NULL`);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitParam = `$${idx++}`;
  const offsetParam = `$${idx++}`;
  values.push(query.limit, (query.page - 1) * query.limit);

  const [rowsRes, countRes] = await Promise.all([
    pool.query<RiskAlertRow>(
      `SELECT r.id, r.user_id, u.name AS user_name, r.title, r.description,
              r.severity, r.source, r.metadata, r.acknowledged_at, r.created_at
       FROM risk_alerts r
       LEFT JOIN users u ON u.id = r.user_id
       ${where}
       ORDER BY r.created_at DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      values,
    ),
    pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM risk_alerts r ${where}`,
      values.slice(0, idx - 3),
    ),
  ]);
  return { items: rowsRes.rows, total: Number(countRes.rows[0]?.total ?? 0) };
};

export const acknowledgeAlert = async (id: string): Promise<void> => {
  const { rowCount } = await pool.query(
    `UPDATE risk_alerts SET acknowledged_at = NOW() WHERE id = $1 AND acknowledged_at IS NULL`,
    [id],
  );
  if (!rowCount) throw NotFound('Alert not found or already acknowledged');
};
