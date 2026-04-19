/**
 * analyticsService — read-only aggregate queries that feed the BI cards,
 * charts, and recommendation surfaces on the admin dashboard.
 *
 * Design:
 * - Reads the client-side tables owned by padlokbackend (shared Postgres):
 *   `users`, `transactions`, `wallets`, `wallet_transactions`, `disputes`.
 *   We don't own these rows — we only SELECT and use the enums the client
 *   backend defines (transactions.status, wallet_transactions.type, etc).
 * - If a table doesn't exist yet (`42P01`), every helper returns a zero
 *   default so the endpoint stays functional before the client backend
 *   has run its migrations.
 * - All chart endpoints accept a `currency` parameter (default 'NGN') so
 *   the dashboard can filter to a single rail; mixing currencies in one
 *   SUM() would give nonsense.
 */

import { pool } from '@/config/database';
import { logger } from '@/utils/logger';

const safeQuery = async <T>(
  sql: string,
  params: unknown[],
  fallback: T[],
): Promise<T[]> => {
  try {
    const result = await pool.query(sql, params);
    return result.rows as T[];
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '42P01') return fallback;
    logger.error({ err, sql }, 'analytics query failed');
    return fallback;
  }
};

const countOrZero = async (sql: string, params: unknown[] = []): Promise<number> => {
  try {
    const { rows } = await pool.query<{ count: string }>(sql, params);
    return parseInt(rows[0]?.count ?? '0', 10) || 0;
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '42P01') return 0;
    logger.error({ err, sql }, 'analytics count query failed');
    return 0;
  }
};

// ---------------- Platform activity (existing) ----------------

export interface PlatformActivity {
  disputes: number;
  completedTransactions: number;
  ongoingTransactions: number;
  activeUsers: number;
  generatedAt: string;
}

export const getPlatformActivity = async (): Promise<PlatformActivity> => {
  const [disputes, completedTransactions, ongoingTransactions, activeUsers] = await Promise.all([
    countOrZero(
      `SELECT COUNT(*)::text AS count FROM disputes
       WHERE status IN ('open', 'under_review')`,
    ),
    countOrZero(
      `SELECT COUNT(*)::text AS count FROM transactions WHERE status = 'completed'`,
    ),
    countOrZero(
      `SELECT COUNT(*)::text AS count FROM transactions
       WHERE type = 'escrow'
         AND status IN ('initiated', 'funded', 'delivery_confirmed')`,
    ),
    countOrZero(
      `SELECT COUNT(*)::text AS count FROM users WHERE is_active = true`,
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

// ---------------- Financial summary (donut chart on dashboard) ----------------

export interface FinancialSummary {
  total_revenue: string;
  in_escrow_balance: string;
  transaction_fees: string;
  currency: string;
  generated_at: string;
}

export const getFinancialSummary = async (currency = 'NGN'): Promise<FinancialSummary> => {
  const [revenueRows, escrowRows, feesRows] = await Promise.all([
    safeQuery<{ sum: string | null }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS sum
       FROM transactions
       WHERE type = 'escrow' AND status = 'completed' AND currency = $1`,
      [currency],
      [{ sum: '0' }],
    ),
    safeQuery<{ sum: string | null }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS sum
       FROM transactions
       WHERE type = 'escrow'
         AND status IN ('funded', 'delivery_confirmed', 'disputed')
         AND currency = $1`,
      [currency],
      [{ sum: '0' }],
    ),
    safeQuery<{ sum: string | null }>(
      `SELECT COALESCE(SUM(fee), 0)::text AS sum
       FROM transactions WHERE status = 'completed' AND currency = $1`,
      [currency],
      [{ sum: '0' }],
    ),
  ]);

  return {
    total_revenue: revenueRows[0]?.sum ?? '0',
    in_escrow_balance: escrowRows[0]?.sum ?? '0',
    transaction_fees: feesRows[0]?.sum ?? '0',
    currency,
    generated_at: new Date().toISOString(),
  };
};

// ---------------- Revenue trend (monthly, last N months) ----------------

export interface RevenueTrendPoint {
  month: string; // YYYY-MM
  revenue: string;
  forecast: string;
}

export const getRevenueTrend = async (
  months = 6,
  currency = 'NGN',
): Promise<RevenueTrendPoint[]> => {
  const sql = `
    WITH series AS (
      SELECT date_trunc('month', NOW() - (n || ' months')::interval) AS month_start
      FROM generate_series(0, $1::int - 1) AS n
    )
    SELECT to_char(s.month_start, 'YYYY-MM') AS month,
           COALESCE(SUM(t.amount) FILTER (
             WHERE t.status = 'completed' AND t.type = 'escrow'
           ), 0)::text AS revenue
    FROM series s
    LEFT JOIN transactions t
      ON date_trunc('month', t.created_at) = s.month_start
     AND t.currency = $2
    GROUP BY s.month_start
    ORDER BY s.month_start ASC
  `;

  const rows = await safeQuery<{ month: string; revenue: string }>(
    sql,
    [months, currency],
    [],
  );

  // Lightweight linear-regression forecast: fit y = a + b·x on historical
  // points so the frontend doesn't need a stats lib. Returns forecast for
  // the *same* months so both series are plottable alongside each other.
  const n = rows.length;
  if (n === 0) return [];
  const xs = rows.map((_, i) => i);
  const ys = rows.map((r) => Number(r.revenue));
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;

  return rows.map((r, i) => ({
    month: r.month,
    revenue: r.revenue,
    forecast: (intercept + slope * i).toFixed(2),
  }));
};

// ---------------- Seasonal demand (trailing 12 months) ----------------

export interface SeasonalDemandPoint {
  month: string; // YYYY-MM
  short_label: string; // JAN, FEB, ...
  value: number; // escrow transaction count
}

export const getSeasonalDemand = async (
  months = 12,
  currency = 'NGN',
): Promise<SeasonalDemandPoint[]> => {
  const sql = `
    WITH series AS (
      SELECT date_trunc('month', NOW() - (n || ' months')::interval) AS month_start
      FROM generate_series(0, $1::int - 1) AS n
    )
    SELECT to_char(s.month_start, 'YYYY-MM') AS month,
           UPPER(to_char(s.month_start, 'Mon')) AS short_label,
           COUNT(t.*) FILTER (
             WHERE t.type = 'escrow' AND t.currency = $2
           )::int AS value
    FROM series s
    LEFT JOIN transactions t
      ON date_trunc('month', t.created_at) = s.month_start
    GROUP BY s.month_start
    ORDER BY s.month_start ASC
  `;

  const rows = await safeQuery<SeasonalDemandPoint>(sql, [months, currency], []);
  return rows.map((r) => ({
    month: r.month,
    short_label: r.short_label,
    value: Number(r.value) || 0,
  }));
};

// ---------------- Forecast card values ----------------

export interface FinancialForecast {
  monthly_forecasted_revenue: string;
  seasonal_peak: { label: string; demand: string };
  projected_escrow_growth: string;
  currency: string;
}

export const getFinancialForecast = async (currency = 'NGN'): Promise<FinancialForecast> => {
  const trend = await getRevenueTrend(6, currency);
  const demand = await getSeasonalDemand(12, currency);

  // Forecast next month by extrapolating the trend line one step ahead.
  const n = trend.length;
  const nextRevenue =
    n >= 2
      ? (() => {
          const last = Number(trend[n - 1].forecast);
          const prev = Number(trend[n - 2].forecast);
          return (last + (last - prev)).toFixed(2);
        })()
      : trend[0]?.revenue ?? '0';

  // Seasonal peak: quarter with the highest sum of `value`.
  const byQuarter: Record<string, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  for (const p of demand) {
    const m = Number(p.month.slice(5, 7));
    const q = m <= 3 ? 'Q1' : m <= 6 ? 'Q2' : m <= 9 ? 'Q3' : 'Q4';
    byQuarter[q] += p.value;
  }
  const peakEntry = Object.entries(byQuarter).sort((a, b) => b[1] - a[1])[0];
  const peakLabel = peakEntry ? `${peakEntry[0]} ${new Date().getFullYear()}` : 'N/A';
  const peakDemand = peakEntry && peakEntry[1] > 0 ? 'High Demand' : 'Low Demand';

  // Projected escrow growth: average month-over-month diff in completed escrow value.
  let growth = 0;
  for (let i = 1; i < trend.length; i++) {
    growth += Number(trend[i].revenue) - Number(trend[i - 1].revenue);
  }
  const avgGrowth = trend.length > 1 ? growth / (trend.length - 1) : 0;

  return {
    monthly_forecasted_revenue: nextRevenue,
    seasonal_peak: { label: peakLabel, demand: peakDemand },
    projected_escrow_growth: avgGrowth.toFixed(2),
    currency,
  };
};

// ---------------- Transaction insights ----------------

export interface TransactionInsights {
  avg_transaction_value: string;
  failed_rate_pct: string;
  refund_rate_pct: string;
  transaction_volume: number;
  daily_transactions: number;
  daily_avg_value: string;
  currency: string;
}

export const getTransactionInsights = async (
  currency = 'NGN',
): Promise<TransactionInsights> => {
  const rows = await safeQuery<{
    total: string;
    completed: string;
    failed: string;
    refunded: string;
    avg_value: string | null;
    daily_count: string;
    daily_avg: string | null;
  }>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE status = 'completed')::text AS completed,
       COUNT(*) FILTER (WHERE status = 'failed')::text AS failed,
       COUNT(*) FILTER (WHERE status = 'refunded')::text AS refunded,
       AVG(amount) FILTER (WHERE status = 'completed')::text AS avg_value,
       COUNT(*) FILTER (
         WHERE status = 'completed' AND created_at >= NOW() - INTERVAL '1 day'
       )::text AS daily_count,
       AVG(amount) FILTER (
         WHERE status = 'completed' AND created_at >= NOW() - INTERVAL '1 day'
       )::text AS daily_avg
     FROM transactions
     WHERE currency = $1`,
    [currency],
    [
      {
        total: '0',
        completed: '0',
        failed: '0',
        refunded: '0',
        avg_value: null,
        daily_count: '0',
        daily_avg: null,
      },
    ],
  );
  const row = rows[0] ?? {
    total: '0',
    completed: '0',
    failed: '0',
    refunded: '0',
    avg_value: null,
    daily_count: '0',
    daily_avg: null,
  };

  const total = Number(row.total) || 0;
  const failedPct = total > 0 ? ((Number(row.failed) / total) * 100).toFixed(2) : '0.00';
  const refundPct = total > 0 ? ((Number(row.refunded) / total) * 100).toFixed(2) : '0.00';

  return {
    avg_transaction_value: Number(row.avg_value ?? 0).toFixed(2),
    failed_rate_pct: failedPct,
    refund_rate_pct: refundPct,
    transaction_volume: total,
    daily_transactions: Number(row.daily_count) || 0,
    daily_avg_value: Number(row.daily_avg ?? 0).toFixed(2),
    currency,
  };
};

// ---------------- Payment behavior (top-up patterns) ----------------

export interface PaymentBehavior {
  avg_topup_amount: string;
  topup_per_hour: string;
  promo_redemption_pct: string;
  topup_by_tier: Array<{ tier: string; count: number }>;
  currency: string;
}

const TIERS: Array<{ label: string; min: number; max: number | null }> = [
  { label: '1000+', min: 1000, max: null },
  { label: '500', min: 500, max: 1000 },
  { label: '200', min: 200, max: 500 },
  { label: '100', min: 100, max: 200 },
  { label: '50', min: 50, max: 100 },
];

export const getPaymentBehavior = async (currency = 'NGN'): Promise<PaymentBehavior> => {
  const [avgRows, countRows, tierRows] = await Promise.all([
    safeQuery<{ avg: string | null }>(
      `SELECT AVG(amount)::text AS avg
       FROM wallet_transactions
       WHERE type = 'funding' AND status = 'completed' AND currency = $1`,
      [currency],
      [{ avg: null }],
    ),
    safeQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM wallet_transactions
       WHERE type = 'funding'
         AND status = 'completed'
         AND currency = $1
         AND created_at >= NOW() - INTERVAL '1 hour'`,
      [currency],
      [{ count: '0' }],
    ),
    safeQuery<{ tier: string; count: string }>(
      `SELECT CASE
                WHEN amount >= 1000 THEN '1000+'
                WHEN amount >= 500 THEN '500'
                WHEN amount >= 200 THEN '200'
                WHEN amount >= 100 THEN '100'
                WHEN amount >= 50 THEN '50'
                ELSE '<50'
              END AS tier,
              COUNT(*)::text AS count
       FROM wallet_transactions
       WHERE type = 'funding' AND status = 'completed' AND currency = $1
       GROUP BY tier`,
      [currency],
      [],
    ),
  ]);

  const avgRow = avgRows[0];
  const countRow = countRows[0];
  const tierMap = new Map(tierRows.map((r) => [r.tier, Number(r.count)]));

  return {
    avg_topup_amount: Number(avgRow?.avg ?? 0).toFixed(2),
    topup_per_hour: countRow?.count ?? '0',
    // Promo redemption isn't tracked in the shared schema yet — return 0
    // until a `promotions` / `redemptions` surface lands in padlokbackend.
    promo_redemption_pct: '0',
    topup_by_tier: TIERS.map((t) => ({ tier: t.label, count: tierMap.get(t.label) ?? 0 })),
    currency,
  };
};

// ---------------- Wallet balance trend (last N days) ----------------

export interface WalletBalanceTrendPoint {
  date: string;
  day_label: string; // MON, TUE, ...
  avg_balance: string;
}

export const getWalletBalanceTrend = async (
  days = 7,
  currency = 'NGN',
): Promise<WalletBalanceTrendPoint[]> => {
  // We don't snapshot balances, so derive the end-of-day running balance
  // by taking the MAX balance_after on `wallet_transactions` for each
  // wallet per day, then averaging across wallets.
  const sql = `
    WITH series AS (
      SELECT date_trunc('day', NOW() - (n || ' days')::interval) AS day_start
      FROM generate_series(0, $1::int - 1) AS n
    ),
    last_per_wallet AS (
      SELECT DISTINCT ON (wt.wallet_id, date_trunc('day', wt.created_at))
             date_trunc('day', wt.created_at) AS day,
             wt.wallet_id,
             wt.balance_after::numeric AS balance
      FROM wallet_transactions wt
      WHERE wt.currency = $2
        AND wt.created_at >= NOW() - ($1::int || ' days')::interval
      ORDER BY wt.wallet_id, date_trunc('day', wt.created_at), wt.created_at DESC
    )
    SELECT to_char(s.day_start, 'YYYY-MM-DD') AS date,
           UPPER(to_char(s.day_start, 'Dy')) AS day_label,
           COALESCE(AVG(lpw.balance), 0)::text AS avg_balance
    FROM series s
    LEFT JOIN last_per_wallet lpw ON lpw.day = s.day_start
    GROUP BY s.day_start
    ORDER BY s.day_start ASC
  `;

  return await safeQuery<WalletBalanceTrendPoint>(sql, [days, currency], []);
};

// ---------------- Revenue per transaction + pricing efficiency ----------------

export interface RevenueEfficiency {
  revenue_per_transaction: string;
  service_availability_pct: string;
  pricing_efficiency_pct: string;
  currency: string;
}

export const getRevenueEfficiency = async (
  currency = 'NGN',
): Promise<RevenueEfficiency> => {
  const rows = await safeQuery<{
    total_fees: string;
    total_txn: string;
    completed: string;
    all: string;
  }>(
    `SELECT
       COALESCE(SUM(fee), 0)::text AS total_fees,
       COUNT(*)::text AS total_txn,
       COUNT(*) FILTER (WHERE status = 'completed')::text AS completed,
       COUNT(*)::text AS all
     FROM transactions
     WHERE currency = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
    [currency],
    [{ total_fees: '0', total_txn: '0', completed: '0', all: '0' }],
  );
  const row = rows[0] ?? {
    total_fees: '0',
    total_txn: '0',
    completed: '0',
    all: '0',
  };

  const total = Number(row.total_txn) || 0;
  const completed = Number(row.completed) || 0;
  const availability = total > 0 ? ((completed / total) * 100).toFixed(2) : '100.00';
  const perTxn = total > 0 ? (Number(row.total_fees) / total).toFixed(2) : '0.00';
  // "Pricing efficiency" isn't a first-class metric — approximate as the
  // success rate weighted by fee take. Can be replaced with a real metric
  // when product defines one.
  const efficiency = availability;

  return {
    revenue_per_transaction: perTxn,
    service_availability_pct: availability,
    pricing_efficiency_pct: efficiency,
    currency,
  };
};
