/**
 * userService — admin-scoped read operations over the shared `users`
 * table + derived aggregates (transactions, disputes, ratings, flags).
 *
 * No mutations on user PII — editing users happens on padlokbackend for
 * now. The only mutating ops an admin has here are status changes
 * (suspend/reactivate) and flag operations (separate feature).
 */

import { pool } from '@/config/database';
import { NotFound } from '@/utils/AppError';

export interface UserRow {
  id: string;
  name: string;
  email: string;
  phone_number: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  is_active: boolean;
  status: string | null;
  created_at: string;
  last_login_at: string | null;
  wallet_balance: string | null;
  total_transactions: number;
  total_disputes: number;
  open_disputes: number;
  avg_rating: string | null;
  total_volume: string;
  flag_count: number;
  risk_level: 'high' | 'medium' | 'low' | 'none';
}

const userFlagsExistsQuery = `
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_flags'
  ) AS present
`;

let userFlagsTableCache: { present: boolean; checkedAt: number } | null = null;
const USER_FLAGS_CHECK_TTL_MS = 60_000;

const userFlagsTableExists = async (): Promise<boolean> => {
  const now = Date.now();
  if (userFlagsTableCache && now - userFlagsTableCache.checkedAt < USER_FLAGS_CHECK_TTL_MS) {
    return userFlagsTableCache.present;
  }
  const { rows } = await pool.query<{ present: boolean }>(userFlagsExistsQuery);
  const present = Boolean(rows[0]?.present);
  userFlagsTableCache = { present, checkedAt: now };
  return present;
};

const buildUserSelect = (withFlags: boolean): string => `
  u.id,
  u.name,
  u.email,
  u.phone_number,
  u.avatar_url,
  u.is_admin,
  u.is_active,
  COALESCE(u.status, CASE WHEN u.is_active THEN 'active' ELSE 'inactive' END) AS status,
  u.created_at,
  u.last_login_at,
  w.balance::text AS wallet_balance,
  (SELECT COUNT(*) FROM transactions t
    WHERE t.user_id = u.id OR t.receiver_id = u.id)::int AS total_transactions,
  (SELECT COUNT(*) FROM disputes d
    JOIN transactions t ON t.id = d.escrow_transaction_id
    WHERE t.user_id = u.id OR t.receiver_id = u.id)::int AS total_disputes,
  (SELECT COUNT(*) FROM disputes d
    JOIN transactions t ON t.id = d.escrow_transaction_id
    WHERE (t.user_id = u.id OR t.receiver_id = u.id)
      AND d.status IN ('open', 'under_review'))::int AS open_disputes,
  (SELECT ROUND(AVG(rating)::numeric, 2)::text FROM ratings
    WHERE reviewee_id = u.id) AS avg_rating,
  COALESCE((SELECT SUM(amount) FROM transactions t
    WHERE (t.user_id = u.id OR t.receiver_id = u.id)
      AND t.status = 'completed'), 0)::text AS total_volume,
  ${
    withFlags
      ? `COALESCE((SELECT COUNT(*) FROM user_flags f
           WHERE f.user_id = u.id AND f.resolved_at IS NULL), 0)::int AS flag_count,
         CASE
           WHEN (SELECT COUNT(*) FROM user_flags f
                 WHERE f.user_id = u.id AND f.severity = 'critical' AND f.resolved_at IS NULL) > 0
             THEN 'high'
           WHEN (SELECT COUNT(*) FROM user_flags f
                 WHERE f.user_id = u.id AND f.severity = 'warning' AND f.resolved_at IS NULL) > 0
             THEN 'medium'
           WHEN (SELECT COUNT(*) FROM user_flags f
                 WHERE f.user_id = u.id AND f.resolved_at IS NULL) > 0
             THEN 'low'
           ELSE 'none'
         END AS risk_level`
      : `0::int AS flag_count,
         'none'::text AS risk_level`
  }
`;

export interface ListUsersQuery {
  page: number;
  limit: number;
  search?: string;
  status?: 'active' | 'suspended' | 'flagged' | 'banned';
  minFlags?: number;
}

export const listUsers = async (
  query: ListUsersQuery,
): Promise<{ items: UserRow[]; total: number }> => {
  const withFlags = await userFlagsTableExists();
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (query.search) {
    conditions.push(`(u.name ILIKE $${idx} OR u.email ILIKE $${idx} OR u.phone_number ILIKE $${idx})`);
    values.push(`%${query.search}%`);
    idx++;
  }
  if (query.status === 'active') conditions.push(`u.is_active = TRUE`);
  if (query.status === 'suspended' || query.status === 'banned') conditions.push(`u.is_active = FALSE`);
  if ((query.status === 'flagged' || (query.minFlags ?? 0) > 0) && withFlags) {
    const threshold = query.minFlags ?? 1;
    conditions.push(
      `(SELECT COUNT(*) FROM user_flags f WHERE f.user_id = u.id AND f.resolved_at IS NULL) >= $${idx++}`,
    );
    values.push(threshold);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitParam = `$${idx++}`;
  const offsetParam = `$${idx++}`;
  values.push(query.limit, (query.page - 1) * query.limit);

  const [rowsRes, countRes] = await Promise.all([
    pool.query<UserRow>(
      `SELECT ${buildUserSelect(withFlags)}
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       ${where}
       ORDER BY u.created_at DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      values,
    ),
    pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM users u ${where}`,
      values.slice(0, idx - 3),
    ),
  ]);

  return { items: rowsRes.rows, total: Number(countRes.rows[0]?.total ?? 0) };
};

export const getUserById = async (id: string): Promise<UserRow> => {
  const withFlags = await userFlagsTableExists();
  const { rows } = await pool.query<UserRow>(
    `SELECT ${buildUserSelect(withFlags)}
     FROM users u
     LEFT JOIN wallets w ON w.user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [id],
  );
  const user = rows[0];
  if (!user) throw NotFound('User not found');
  return user;
};

export interface UserActivityEvent {
  at: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
}

export const getUserActivity = async (
  userId: string,
  limit = 50,
): Promise<UserActivityEvent[]> => {
  try {
    const { rows } = await pool.query<{
      created_at: string;
      action: string;
      entity_type: string;
      entity_id: string | null;
      details: Record<string, unknown> | null;
      ip_address: string | null;
    }>(
      `SELECT created_at, action, entity_type, entity_id, details, ip_address::text
       FROM audit_log
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit],
    );
    return rows.map((r) => ({
      at: r.created_at,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      details: r.details,
      ip_address: r.ip_address,
    }));
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '42P01') return [];
    throw err;
  }
};

export interface UserTransactionRow {
  id: string;
  type: string;
  status: string;
  amount: string;
  currency: string;
  role: 'buyer' | 'seller';
  counterparty_id: string | null;
  counterparty_name: string | null;
  created_at: string;
}

export const getUserTransactions = async (
  userId: string,
  page: number,
  limit: number,
): Promise<{ items: UserTransactionRow[]; total: number }> => {
  const [rowsRes, countRes] = await Promise.all([
    pool.query<UserTransactionRow>(
      `SELECT t.id, t.type, t.status, t.amount::text, t.currency,
              CASE WHEN t.user_id = $1 THEN 'buyer' ELSE 'seller' END AS role,
              CASE WHEN t.user_id = $1 THEN t.receiver_id ELSE t.user_id END AS counterparty_id,
              COALESCE(
                CASE WHEN t.user_id = $1 THEN su.name ELSE bu.name END,
                NULL
              ) AS counterparty_name,
              t.created_at
       FROM transactions t
       LEFT JOIN users bu ON bu.id = t.user_id
       LEFT JOIN users su ON su.id = t.receiver_id
       WHERE t.user_id = $1 OR t.receiver_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, (page - 1) * limit],
    ),
    pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM transactions
       WHERE user_id = $1 OR receiver_id = $1`,
      [userId],
    ),
  ]);
  return { items: rowsRes.rows, total: Number(countRes.rows[0]?.total ?? 0) };
};

export interface UserDisputeRow {
  id: string;
  escrow_transaction_id: string;
  reason: string;
  status: string;
  amount: string | null;
  currency: string | null;
  counterparty_name: string | null;
  role: 'buyer' | 'seller' | 'unknown';
  created_at: string;
  resolved_at: string | null;
}

export const getUserDisputes = async (
  userId: string,
  page: number,
  limit: number,
): Promise<{ items: UserDisputeRow[]; total: number }> => {
  const [rowsRes, countRes] = await Promise.all([
    pool.query<UserDisputeRow>(
      `SELECT d.id,
              d.escrow_transaction_id,
              d.reason,
              d.status,
              t.amount::text AS amount,
              t.currency,
              CASE
                WHEN t.user_id = $1 THEN su.name
                WHEN t.receiver_id = $1 THEN bu.name
                ELSE NULL
              END AS counterparty_name,
              CASE
                WHEN t.user_id = $1 THEN 'buyer'
                WHEN t.receiver_id = $1 THEN 'seller'
                ELSE 'unknown'
              END AS role,
              d.created_at,
              d.resolved_at
       FROM disputes d
       JOIN transactions t ON t.id = d.escrow_transaction_id
       LEFT JOIN users bu ON bu.id = t.user_id
       LEFT JOIN users su ON su.id = t.receiver_id
       WHERE t.user_id = $1 OR t.receiver_id = $1
       ORDER BY d.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, (page - 1) * limit],
    ),
    pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM disputes d
       JOIN transactions t ON t.id = d.escrow_transaction_id
       WHERE t.user_id = $1 OR t.receiver_id = $1`,
      [userId],
    ),
  ]);
  return { items: rowsRes.rows, total: Number(countRes.rows[0]?.total ?? 0) };
};

/**
 * Set user active/inactive. The shared `users` table only has `is_active`
 * today — richer states (suspended, banned) are recorded on `user_flags`.
 */
export const setUserActive = async (
  userId: string,
  isActive: boolean,
): Promise<UserRow> => {
  const { rowCount } = await pool.query(
    `UPDATE users SET is_active = $2, updated_at = NOW() WHERE id = $1`,
    [userId, isActive],
  );
  if (!rowCount) throw NotFound('User not found');
  return getUserById(userId);
};
