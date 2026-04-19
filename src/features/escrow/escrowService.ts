/**
 * escrowService — admin-scoped read + dispute resolution over the shared
 * Postgres database. All queries join against the unified `transactions`
 * table (type='escrow'), `wallet_transactions`, and `disputes`.
 *
 * This module has no req/res awareness and no user-scoping — it trusts that
 * the caller has already passed auth + requirePermission at the HTTP layer.
 */

import { pool } from '@/config/database';
import { NotFound, BadRequest } from '@/utils/AppError';
import { withTransaction } from '@/utils/withTransaction';

type EscrowStatus =
  | 'initiated'
  | 'funded'
  | 'delivery_confirmed'
  | 'completed'
  | 'disputed'
  | 'refunded'
  | 'cancelled';

type DisputeStatus =
  | 'open'
  | 'under_review'
  | 'resolved_refund'
  | 'resolved_release'
  | 'closed';

export interface EscrowRow {
  id: string;
  status: EscrowStatus;
  reference: string;
  amount: string;
  fee: string;
  currency: string;
  buyer_id: string;
  buyer_name: string | null;
  buyer_email: string | null;
  seller_id: string | null;
  seller_name: string | null;
  seller_email: string | null;
  item_title: string | null;
  item_description: string | null;
  item_photos: string[] | null;
  delivery_window: string | null;
  delivery_deadline: string | null;
  delivery_confirmed_at: string | null;
  buyer_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  // Shape the dashboard consumes
  price: string;
}

export interface ListEscrowsQuery {
  page: number;
  limit: number;
  status?: EscrowStatus;
  buyerId?: string;
  sellerId?: string;
  from?: string;
  to?: string;
}

const ESCROW_SELECT = `
  t.id,
  t.status,
  t.reference,
  t.amount,
  t.amount AS price,
  t.fee,
  t.currency,
  t.user_id AS buyer_id,
  bu.name AS buyer_name,
  bu.email AS buyer_email,
  t.receiver_id AS seller_id,
  su.name AS seller_name,
  su.email AS seller_email,
  t.item_title,
  t.item_description,
  t.item_photos,
  t.delivery_window::text AS delivery_window,
  t.delivery_deadline,
  t.delivery_confirmed_at,
  t.buyer_confirmed_at,
  t.created_at,
  t.updated_at
`;

export const listEscrows = async (
  query: ListEscrowsQuery,
): Promise<{ items: EscrowRow[]; total: number }> => {
  const conditions: string[] = [`t.type = 'escrow'`];
  const values: unknown[] = [];
  let idx = 1;

  if (query.status) {
    conditions.push(`t.status = $${idx++}`);
    values.push(query.status);
  }
  if (query.buyerId) {
    conditions.push(`t.user_id = $${idx++}`);
    values.push(query.buyerId);
  }
  if (query.sellerId) {
    conditions.push(`t.receiver_id = $${idx++}`);
    values.push(query.sellerId);
  }
  if (query.from) {
    conditions.push(`t.created_at >= $${idx++}`);
    values.push(query.from);
  }
  if (query.to) {
    conditions.push(`t.created_at <= $${idx++}`);
    values.push(query.to);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const limitParam = `$${idx++}`;
  const offsetParam = `$${idx++}`;
  values.push(query.limit, (query.page - 1) * query.limit);

  const [rowsRes, countRes] = await Promise.all([
    pool.query<EscrowRow>(
      `SELECT ${ESCROW_SELECT}
       FROM transactions t
       LEFT JOIN users bu ON bu.id = t.user_id
       LEFT JOIN users su ON su.id = t.receiver_id
       ${where}
       ORDER BY t.created_at DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      values,
    ),
    pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM transactions t ${where}`,
      values.slice(0, idx - 3),
    ),
  ]);

  return {
    items: rowsRes.rows,
    total: Number(countRes.rows[0]?.total ?? 0),
  };
};

export const getEscrowById = async (id: string): Promise<EscrowRow & { dispute: DisputeRow | null }> => {
  const { rows } = await pool.query<EscrowRow>(
    `SELECT ${ESCROW_SELECT}
     FROM transactions t
     LEFT JOIN users bu ON bu.id = t.user_id
     LEFT JOIN users su ON su.id = t.receiver_id
     WHERE t.id = $1 AND t.type = 'escrow'
     LIMIT 1`,
    [id],
  );
  const escrow = rows[0];
  if (!escrow) throw NotFound('Escrow transaction not found');

  const { rows: disputeRows } = await pool.query<DisputeRow>(
    `SELECT ${DISPUTE_SELECT}
     FROM disputes d
     LEFT JOIN users ru ON ru.id = d.raised_by
     LEFT JOIN users au ON au.id = d.admin_id
     WHERE d.escrow_transaction_id = $1
     ORDER BY d.created_at DESC
     LIMIT 1`,
    [id],
  );

  return { ...escrow, dispute: disputeRows[0] ?? null };
};

export interface EscrowStats {
  total_in_escrow: string;
  total_released: string;
  total_refunded: string;
  total_cancelled: string;
  escrow_count_by_status: Record<EscrowStatus, number>;
}

export const getEscrowStats = async (currency = 'NGN'): Promise<EscrowStats> => {
  const { rows } = await pool.query<{
    status: EscrowStatus;
    count: string;
    sum: string | null;
  }>(
    `SELECT status, COUNT(*)::text AS count, COALESCE(SUM(amount), 0)::text AS sum
     FROM transactions
     WHERE type = 'escrow' AND currency = $1
     GROUP BY status`,
    [currency],
  );

  const sums: Record<string, string> = {};
  const counts: Record<EscrowStatus, number> = {
    initiated: 0,
    funded: 0,
    delivery_confirmed: 0,
    completed: 0,
    disputed: 0,
    refunded: 0,
    cancelled: 0,
  };
  for (const r of rows) {
    sums[r.status] = r.sum ?? '0';
    counts[r.status] = Number(r.count);
  }

  const sumOf = (...statuses: EscrowStatus[]): string =>
    statuses
      .reduce((acc, s) => acc + Number(sums[s] ?? 0), 0)
      .toFixed(2);

  return {
    total_in_escrow: sumOf('funded', 'delivery_confirmed', 'disputed'),
    total_released: sumOf('completed'),
    total_refunded: sumOf('refunded'),
    total_cancelled: sumOf('cancelled'),
    escrow_count_by_status: counts,
  };
};

// ---------------- Disputes ----------------

export interface DisputeRow {
  id: string;
  escrow_transaction_id: string;
  raised_by: string;
  raised_by_name: string | null;
  raised_by_email: string | null;
  reason: string;
  evidence_photos: string[] | null;
  status: DisputeStatus;
  admin_id: string | null;
  admin_name: string | null;
  admin_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

const DISPUTE_SELECT = `
  d.id,
  d.escrow_transaction_id,
  d.raised_by,
  ru.name AS raised_by_name,
  ru.email AS raised_by_email,
  d.reason,
  d.evidence_photos,
  d.status,
  d.admin_id,
  au.name AS admin_name,
  d.admin_notes,
  d.resolved_at,
  d.created_at,
  d.updated_at
`;

export interface ListDisputesQuery {
  page: number;
  limit: number;
  status?: DisputeStatus;
}

export const listDisputes = async (
  query: ListDisputesQuery,
): Promise<{ items: DisputeRow[]; total: number }> => {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (query.status) {
    conditions.push(`d.status = $${idx++}`);
    values.push(query.status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitParam = `$${idx++}`;
  const offsetParam = `$${idx++}`;
  values.push(query.limit, (query.page - 1) * query.limit);

  const [rowsRes, countRes] = await Promise.all([
    pool.query<DisputeRow>(
      `SELECT ${DISPUTE_SELECT}
       FROM disputes d
       LEFT JOIN users ru ON ru.id = d.raised_by
       LEFT JOIN users au ON au.id = d.admin_id
       ${where}
       ORDER BY d.created_at DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      values,
    ),
    pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM disputes d ${where}`,
      values.slice(0, idx - 3),
    ),
  ]);

  return {
    items: rowsRes.rows,
    total: Number(countRes.rows[0]?.total ?? 0),
  };
};

export interface DisputeDetail extends DisputeRow {
  escrow_amount: string | null;
  escrow_currency: string | null;
  escrow_reference: string | null;
  escrow_item_title: string | null;
  buyer_id: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  seller_id: string | null;
  seller_name: string | null;
  seller_email: string | null;
}

/**
 * Single-dispute detail used by the Evidence Panel. Joins the escrow
 * transaction so the UI can render amount/buyer/seller without a second
 * call, and returns null when the id doesn't match.
 */
export const getDispute = async (disputeId: string): Promise<DisputeDetail | null> => {
  const { rows } = await pool.query<DisputeDetail>(
    `SELECT ${DISPUTE_SELECT},
            t.amount::text AS escrow_amount,
            t.currency AS escrow_currency,
            t.reference AS escrow_reference,
            t.item_title AS escrow_item_title,
            t.user_id AS buyer_id,
            bu.name AS buyer_name,
            bu.email AS buyer_email,
            t.receiver_id AS seller_id,
            su.name AS seller_name,
            su.email AS seller_email
     FROM disputes d
     LEFT JOIN users ru ON ru.id = d.raised_by
     LEFT JOIN users au ON au.id = d.admin_id
     LEFT JOIN transactions t ON t.id = d.escrow_transaction_id
     LEFT JOIN users bu ON bu.id = t.user_id
     LEFT JOIN users su ON su.id = t.receiver_id
     WHERE d.id = $1`,
    [disputeId],
  );
  return rows[0] ?? null;
};

export interface DisputeStats {
  open: number;
  under_review: number;
  resolved_this_month: number;
  avg_resolution_days: string;
}

export const getDisputeStats = async (): Promise<DisputeStats> => {
  const { rows } = await pool.query<{
    open: string;
    under_review: string;
    resolved_this_month: string;
    avg_hours: string | null;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'open')::text AS open,
       COUNT(*) FILTER (WHERE status = 'under_review')::text AS under_review,
       COUNT(*) FILTER (
         WHERE status IN ('resolved_refund', 'resolved_release', 'closed')
           AND resolved_at >= date_trunc('month', NOW())
       )::text AS resolved_this_month,
       AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) FILTER (
         WHERE resolved_at IS NOT NULL
       )::text AS avg_hours
     FROM disputes`,
  );
  const row = rows[0];
  const avgDays = row?.avg_hours ? (Number(row.avg_hours) / 24).toFixed(1) : '0.0';
  return {
    open: Number(row?.open ?? 0),
    under_review: Number(row?.under_review ?? 0),
    resolved_this_month: Number(row?.resolved_this_month ?? 0),
    avg_resolution_days: avgDays,
  };
};

export interface DisputeTimelineEvent {
  at: string;
  kind: 'escrow_created' | 'funded' | 'delivery_confirmed' | 'buyer_confirmed' | 'dispute_raised' | 'dispute_resolved';
  actor_id: string | null;
  actor_name: string | null;
  detail: string;
}

export const getDisputeTimeline = async (
  disputeId: string,
): Promise<DisputeTimelineEvent[]> => {
  const { rows: disputeRows } = await pool.query<{
    escrow_id: string;
    dispute_created_at: string;
    resolved_at: string | null;
    reason: string;
    raised_by: string;
    raised_by_name: string | null;
    admin_id: string | null;
    admin_notes: string | null;
    status: string;
  }>(
    `SELECT d.escrow_transaction_id AS escrow_id,
            d.created_at AS dispute_created_at,
            d.resolved_at,
            d.reason,
            d.raised_by,
            ru.name AS raised_by_name,
            d.admin_id,
            d.admin_notes,
            d.status
     FROM disputes d
     LEFT JOIN users ru ON ru.id = d.raised_by
     WHERE d.id = $1`,
    [disputeId],
  );
  const dispute = disputeRows[0];
  if (!dispute) return [];

  const { rows: escrowRows } = await pool.query<{
    created_at: string;
    delivery_confirmed_at: string | null;
    buyer_confirmed_at: string | null;
    user_id: string;
    receiver_id: string;
    buyer_name: string | null;
    seller_name: string | null;
  }>(
    `SELECT t.created_at, t.delivery_confirmed_at, t.buyer_confirmed_at,
            t.user_id, t.receiver_id,
            bu.name AS buyer_name, su.name AS seller_name
     FROM transactions t
     LEFT JOIN users bu ON bu.id = t.user_id
     LEFT JOIN users su ON su.id = t.receiver_id
     WHERE t.id = $1`,
    [dispute.escrow_id],
  );
  const escrow = escrowRows[0];

  const events: DisputeTimelineEvent[] = [];

  if (escrow) {
    events.push({
      at: escrow.created_at,
      kind: 'escrow_created',
      actor_id: escrow.user_id,
      actor_name: escrow.buyer_name,
      detail: 'Escrow initiated',
    });
    if (escrow.delivery_confirmed_at) {
      events.push({
        at: escrow.delivery_confirmed_at,
        kind: 'delivery_confirmed',
        actor_id: escrow.receiver_id,
        actor_name: escrow.seller_name,
        detail: 'Seller confirmed delivery',
      });
    }
    if (escrow.buyer_confirmed_at) {
      events.push({
        at: escrow.buyer_confirmed_at,
        kind: 'buyer_confirmed',
        actor_id: escrow.user_id,
        actor_name: escrow.buyer_name,
        detail: 'Buyer confirmed receipt',
      });
    }
  }
  events.push({
    at: dispute.dispute_created_at,
    kind: 'dispute_raised',
    actor_id: dispute.raised_by,
    actor_name: dispute.raised_by_name,
    detail: dispute.reason,
  });
  if (dispute.resolved_at) {
    events.push({
      at: dispute.resolved_at,
      kind: 'dispute_resolved',
      actor_id: dispute.admin_id,
      actor_name: null,
      detail: dispute.admin_notes ?? `Resolved (${dispute.status})`,
    });
  }

  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
};

export interface ResolveDisputeInput {
  disputeId: string;
  adminId: string;
  resolution: 'refund' | 'release';
  adminNotes?: string;
}

export interface ResolveDisputeResult {
  disputeId: string;
  escrowId: string;
  resolution: 'refund' | 'release';
  amount: string;
  currency: string;
}

/**
 * Resolve a dispute by either refunding the buyer or releasing funds to
 * the seller. Atomically: updates dispute status, updates escrow status,
 * and credits the corresponding wallet inside a single transaction.
 *
 * If no dispute row exists or the dispute is already resolved, throws.
 * If the underlying escrow isn't in a state that permits resolution (must
 * be 'disputed' or 'funded'/'delivery_confirmed'), throws.
 */
export const resolveDispute = async (
  input: ResolveDisputeInput,
): Promise<ResolveDisputeResult> => {
  return withTransaction(async (client) => {
    const { rows: disputeRows } = await client.query<{
      id: string;
      escrow_transaction_id: string;
      status: DisputeStatus;
    }>(
      `SELECT id, escrow_transaction_id, status
       FROM disputes
       WHERE id = $1
       FOR UPDATE`,
      [input.disputeId],
    );
    const dispute = disputeRows[0];
    if (!dispute) throw NotFound('Dispute not found');
    if (
      dispute.status === 'resolved_refund' ||
      dispute.status === 'resolved_release' ||
      dispute.status === 'closed'
    ) {
      throw BadRequest('Dispute is already resolved');
    }

    const { rows: escrowRows } = await client.query<{
      id: string;
      status: EscrowStatus;
      amount: string;
      currency: string;
      user_id: string;
      receiver_id: string;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT id, status, amount, currency, user_id, receiver_id, metadata
       FROM transactions
       WHERE id = $1 AND type = 'escrow'
       FOR UPDATE`,
      [dispute.escrow_transaction_id],
    );
    const escrow = escrowRows[0];
    if (!escrow) throw NotFound('Escrow transaction not found');

    // Wallet credit target: refund → buyer, release → seller.
    const targetUserId =
      input.resolution === 'refund' ? escrow.user_id : escrow.receiver_id;
    const { rows: walletRows } = await client.query<{
      id: string;
      balance: string;
    }>(
      `SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [targetUserId],
    );
    const wallet = walletRows[0];
    if (!wallet) throw NotFound('Target wallet not found');

    const newBalance = (Number(wallet.balance) + Number(escrow.amount)).toFixed(4);
    await client.query(
      `UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2`,
      [newBalance, wallet.id],
    );

    const walletTxType =
      input.resolution === 'refund' ? 'escrow_refund' : 'escrow_release';
    const ledgerRef = `${walletTxType}_${dispute.id}_${Date.now()}`;
    await client.query(
      `INSERT INTO wallet_transactions
         (wallet_id, type, amount, balance_before, balance_after, currency,
          status, reference, escrow_transaction_id, description)
       VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, $8, $9)`,
      [
        wallet.id,
        walletTxType,
        escrow.amount,
        wallet.balance,
        newBalance,
        escrow.currency,
        ledgerRef,
        escrow.id,
        `Dispute ${input.resolution} — admin ${input.adminId}`,
      ],
    );

    const newEscrowStatus: EscrowStatus =
      input.resolution === 'refund' ? 'refunded' : 'completed';
    await client.query(
      `UPDATE transactions SET status = $1, updated_at = NOW() WHERE id = $2`,
      [newEscrowStatus, escrow.id],
    );

    const newDisputeStatus: DisputeStatus =
      input.resolution === 'refund' ? 'resolved_refund' : 'resolved_release';
    await client.query(
      `UPDATE disputes
       SET status = $1, admin_id = $2, admin_notes = $3,
           resolved_at = NOW(), updated_at = NOW()
       WHERE id = $4`,
      [newDisputeStatus, input.adminId, input.adminNotes ?? null, dispute.id],
    );

    return {
      disputeId: dispute.id,
      escrowId: escrow.id,
      resolution: input.resolution,
      amount: escrow.amount,
      currency: escrow.currency,
    };
  });
};
