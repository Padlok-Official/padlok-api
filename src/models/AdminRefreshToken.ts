/**
 * AdminRefreshToken model — manages revocable long-lived refresh tokens.
 *
 * Security: we never store the raw token. The client gets a signed JWT
 * wrapping a random ID; we hash that ID with bcrypt and store the hash.
 * On refresh, we bcrypt.compare the ID against all unrevoked, unexpired
 * rows for the admin. Rotation: on every refresh we revoke the old and
 * issue a new pair.
 */

import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import { pool } from '@/config/database';

const HASH_ROUNDS = 10; // slightly cheaper than password (12) — rotated often

export interface CreateRefreshTokenInput {
  adminId: string;
  rawToken: string;
  expiresAt: Date;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export const create = async (
  input: CreateRefreshTokenInput,
  client?: PoolClient,
): Promise<string> => {
  const tokenHash = await bcrypt.hash(input.rawToken, HASH_ROUNDS);
  const runner = client ?? pool;
  const { rows } = await runner.query<{ id: string }>(
    `INSERT INTO admin_refresh_tokens (admin_id, token_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [input.adminId, tokenHash, input.userAgent ?? null, input.ipAddress ?? null, input.expiresAt],
  );
  return rows[0].id;
};

export interface ActiveTokenRow {
  id: string;
  admin_id: string;
  token_hash: string;
  expires_at: Date;
}

/**
 * Find a live token row matching the raw token. Checks all of the admin's
 * unrevoked, unexpired tokens via bcrypt.compare (timing-safe).
 * Returns null if no match.
 */
export const findActiveByRawToken = async (
  adminId: string,
  rawToken: string,
): Promise<ActiveTokenRow | null> => {
  const { rows } = await pool.query<ActiveTokenRow>(
    `SELECT id, admin_id, token_hash, expires_at
     FROM admin_refresh_tokens
     WHERE admin_id = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()`,
    [adminId],
  );

  for (const row of rows) {
    // bcrypt.compare is timing-safe; iterate through the (usually tiny) set
    // of live tokens for this admin.
    // eslint-disable-next-line no-await-in-loop
    if (await bcrypt.compare(rawToken, row.token_hash)) {
      return row;
    }
  }
  return null;
};

export const revoke = async (tokenId: string, client?: PoolClient): Promise<void> => {
  const runner = client ?? pool;
  await runner.query(
    `UPDATE admin_refresh_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`,
    [tokenId],
  );
};

export const revokeAllForAdmin = async (
  adminId: string,
  client?: PoolClient,
): Promise<number> => {
  const runner = client ?? pool;
  const result = await runner.query(
    `UPDATE admin_refresh_tokens
     SET revoked_at = NOW()
     WHERE admin_id = $1 AND revoked_at IS NULL`,
    [adminId],
  );
  return result.rowCount ?? 0;
};
