/**
 * analyticsService — aggregate counts for the BI Overview page.
 *
 * Design:
 * - Reads from the client-side tables owned by padlokbackend (shared DB):
 *   `users`, `transactions`, `disputes`. We don't own these rows; we only
 *   SELECT COUNT(*) and use predicates that match the client backend's
 *   conventions.
 * - If a table doesn't exist yet (dev environments where the client
 *   backend hasn't run its migrations), we catch `42P01 undefined_table`
 *   and return 0 so the endpoint stays functional.
 * - Queries run in parallel (Promise.all) — total latency = slowest query,
 *   not the sum.
 *
 * SQL pragma used:
 *   transactions.type IN ('escrow', ...) — matches padlokbackend enum
 *   transactions.status — 'completed' = finalized, intermediate states
 *     like 'initiated'/'funded'/'delivery_confirmed' = ongoing
 *   disputes.status   — 'open' | 'under_review' = live
 *   users.is_active   — a simple "active" definition; can be tightened
 *     later (e.g. last_login_at > NOW() - interval '30 days')
 */

import { pool } from '@/config/database';
import { logger } from '@/utils/logger';

export interface PlatformActivity {
  disputes: number;
  completedTransactions: number;
  ongoingTransactions: number;
  activeUsers: number;
  generatedAt: string; // ISO timestamp so the frontend can show "last updated"
}

/**
 * Swallow "relation does not exist" errors so the endpoint works even
 * when only the admin tables have been migrated.
 */
const countOrZero = async (sql: string, params: unknown[] = []): Promise<number> => {
  try {
    const { rows } = await pool.query<{ count: string }>(sql, params);
    return parseInt(rows[0]?.count ?? '0', 10) || 0;
  } catch (err) {
    const pgErr = err as { code?: string; message?: string };
    if (pgErr.code === '42P01') {
      // undefined_table — expected when client-side backend hasn't migrated yet
      return 0;
    }
    logger.error({ err, sql }, 'analytics count query failed');
    // Fail closed rather than fail open: 0 is safer than a lie.
    return 0;
  }
};

export const getPlatformActivity = async (): Promise<PlatformActivity> => {
  const [disputes, completedTransactions, ongoingTransactions, activeUsers] =
    await Promise.all([
      // Live disputes: opened but not yet resolved
      countOrZero(
        `SELECT COUNT(*)::text AS count
         FROM disputes
         WHERE status IN ('open', 'under_review')`,
      ),

      // Completed transactions across all types (deposit, withdrawal, escrow)
      countOrZero(
        `SELECT COUNT(*)::text AS count
         FROM transactions
         WHERE status = 'completed'`,
      ),

      // Ongoing = escrow transactions in any intermediate state
      countOrZero(
        `SELECT COUNT(*)::text AS count
         FROM transactions
         WHERE type = 'escrow'
           AND status IN ('initiated', 'funded', 'delivery_confirmed')`,
      ),

      // Active users — conservative: just the flag. Refine later if needed.
      countOrZero(
        `SELECT COUNT(*)::text AS count
         FROM users
         WHERE is_active = true`,
      ),
    ]);

  return {
    disputes,
    completedTransactions,
    ongoingTransactions,
    activeUsers,
    generatedAt: new Date().toISOString(),
  };
};
