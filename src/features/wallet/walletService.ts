/**
 * walletService — admin-scoped read operations over the shared Postgres
 * database. Operates on `wallet_transactions` (ledger) and `wallets`.
 */

import { pool } from '@/config/database';
import { NotFound } from '@/utils/AppError';

type WalletTxType =
  | 'funding'
  | 'withdrawal'
  | 'escrow_lock'
  | 'escrow_release'
  | 'escrow_refund';

type WalletTxStatus = 'pending' | 'completed' | 'failed' | 'reversed';

export interface WalletTransactionRow {
  id: string;
  wallet_id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  type: WalletTxType;
  status: WalletTxStatus;
  amount: string;
  fee: string;
  balance_before: string;
  balance_after: string;
  currency: string;
  reference: string;
  paystack_reference: string | null;
  escrow_transaction_id: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

const WALLET_TX_SELECT = `
  wt.id,
  wt.wallet_id,
  w.user_id,
  u.name AS user_name,
  u.email AS user_email,
  wt.type,
  wt.status,
  wt.amount,
  wt.fee,
  wt.balance_before,
  wt.balance_after,
  wt.currency,
  wt.reference,
  wt.paystack_reference,
  wt.escrow_transaction_id,
  wt.description,
  wt.metadata,
  wt.created_at,
  wt.updated_at
`;

export interface ListWalletTxQuery {
  page: number;
  limit: number;
  type?: WalletTxType;
  status?: WalletTxStatus;
  userId?: string;
  walletId?: string;
  from?: string;
  to?: string;
}

export const listWalletTransactions = async (
  query: ListWalletTxQuery,
): Promise<{ items: WalletTransactionRow[]; total: number }> => {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (query.type) {
    conditions.push(`wt.type = $${idx++}`);
    values.push(query.type);
  }
  if (query.status) {
    conditions.push(`wt.status = $${idx++}`);
    values.push(query.status);
  }
  if (query.userId) {
    conditions.push(`w.user_id = $${idx++}`);
    values.push(query.userId);
  }
  if (query.walletId) {
    conditions.push(`wt.wallet_id = $${idx++}`);
    values.push(query.walletId);
  }
  if (query.from) {
    conditions.push(`wt.created_at >= $${idx++}`);
    values.push(query.from);
  }
  if (query.to) {
    conditions.push(`wt.created_at <= $${idx++}`);
    values.push(query.to);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitParam = `$${idx++}`;
  const offsetParam = `$${idx++}`;
  values.push(query.limit, (query.page - 1) * query.limit);

  const [rowsRes, countRes] = await Promise.all([
    pool.query<WalletTransactionRow>(
      `SELECT ${WALLET_TX_SELECT}
       FROM wallet_transactions wt
       JOIN wallets w ON w.id = wt.wallet_id
       LEFT JOIN users u ON u.id = w.user_id
       ${where}
       ORDER BY wt.created_at DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      values,
    ),
    pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM wallet_transactions wt
       JOIN wallets w ON w.id = wt.wallet_id
       ${where}`,
      values.slice(0, idx - 3),
    ),
  ]);

  return {
    items: rowsRes.rows,
    total: Number(countRes.rows[0]?.total ?? 0),
  };
};

export const getWalletTransactionById = async (
  id: string,
): Promise<WalletTransactionRow> => {
  const { rows } = await pool.query<WalletTransactionRow>(
    `SELECT ${WALLET_TX_SELECT}
     FROM wallet_transactions wt
     JOIN wallets w ON w.id = wt.wallet_id
     LEFT JOIN users u ON u.id = w.user_id
     WHERE wt.id = $1
     LIMIT 1`,
    [id],
  );
  const tx = rows[0];
  if (!tx) throw NotFound('Wallet transaction not found');
  return tx;
};

export interface WalletStats {
  total_balance: string;
  total_funding: string;
  total_withdrawals: string;
  total_wallets: number;
  active_wallets: number;
  funding_per_hour: string;
}

export const getWalletStats = async (currency = 'NGN'): Promise<WalletStats> => {
  const [balanceRes, txRes, walletsRes, fundingRateRes] = await Promise.all([
    pool.query<{ sum: string | null }>(
      `SELECT COALESCE(SUM(balance), 0)::text AS sum
       FROM wallets WHERE currency = $1`,
      [currency],
    ),
    pool.query<{ type: WalletTxType; sum: string | null }>(
      `SELECT type, COALESCE(SUM(amount), 0)::text AS sum
       FROM wallet_transactions
       WHERE status = 'completed' AND currency = $1
       GROUP BY type`,
      [currency],
    ),
    pool.query<{ total: string; active: string }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE status = 'active')::text AS active
       FROM wallets WHERE currency = $1`,
      [currency],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM wallet_transactions
       WHERE type = 'funding'
         AND status = 'completed'
         AND currency = $1
         AND created_at >= NOW() - INTERVAL '1 hour'`,
      [currency],
    ),
  ]);

  const sumsByType: Record<string, string> = {};
  for (const row of txRes.rows) sumsByType[row.type] = row.sum ?? '0';

  return {
    total_balance: balanceRes.rows[0]?.sum ?? '0',
    total_funding: sumsByType.funding ?? '0',
    total_withdrawals: sumsByType.withdrawal ?? '0',
    total_wallets: Number(walletsRes.rows[0]?.total ?? 0),
    active_wallets: Number(walletsRes.rows[0]?.active ?? 0),
    funding_per_hour: fundingRateRes.rows[0]?.count ?? '0',
  };
};
