/**
 * AdminInvitation model — manages email-based admin invitations.
 *
 * Token security:
 * - The raw token is 32 random bytes, hex-encoded, sent exactly once in
 *   the invitation email.
 * - We store SHA-256(raw) as `token_hash` for a deterministic, indexable
 *   lookup. Bcrypt would require iterating every pending invite on
 *   accept — wasteful for a short-lived one-time token that isn't a
 *   human-chosen secret. SHA-256 is the right primitive for this use
 *   case (not passwords).
 * - Tokens expire in 7 days; accepted/expired/revoked rows stay for
 *   audit but can't be consumed.
 */

import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { pool } from '@/config/database';
import type { InvitationStatus } from '@/types/admin';

export interface InvitationRow {
  id: string;
  email: string;
  role_id: string;
  token_hash: string;
  status: InvitationStatus;
  invited_by: string | null;
  expires_at: Date;
  accepted_at: Date | null;
  accepted_as: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface InvitationWithRoleRow extends InvitationRow {
  role_name: string;
  inviter_name: string | null;
  inviter_email: string | null;
}

/** Generate a fresh invitation token. Raw value goes in the email URL. */
export const generateToken = (): string =>
  crypto.randomBytes(32).toString('hex');

/** Hash the raw token for DB storage / lookup. */
export const hashToken = (raw: string): string =>
  crypto.createHash('sha256').update(raw).digest('hex');

/**
 * Create a new invitation row. The caller passes the raw token (to email
 * to the invitee); we store only its hash.
 */
export const create = async (
  input: {
    email: string;
    roleId: string;
    rawToken: string;
    invitedBy: string | null;
    expiresAt: Date;
  },
  client?: PoolClient,
): Promise<string> => {
  const runner = client ?? pool;
  const { rows } = await runner.query<{ id: string }>(
    `INSERT INTO admin_invitations
       (email, role_id, token_hash, status, invited_by, expires_at)
     VALUES (LOWER($1), $2, $3, 'pending', $4, $5)
     RETURNING id`,
    [
      input.email,
      input.roleId,
      hashToken(input.rawToken),
      input.invitedBy,
      input.expiresAt,
    ],
  );
  return rows[0].id;
};

/** Find by the raw token (hashes it and looks up). Nullable on any miss. */
export const findByRawToken = async (
  rawToken: string,
): Promise<InvitationRow | null> => {
  const { rows } = await pool.query<InvitationRow>(
    `SELECT * FROM admin_invitations
     WHERE token_hash = $1
     LIMIT 1`,
    [hashToken(rawToken)],
  );
  return rows[0] ?? null;
};

export const findById = async (id: string): Promise<InvitationRow | null> => {
  const { rows } = await pool.query<InvitationRow>(
    `SELECT * FROM admin_invitations WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
};

export const findPendingByEmail = async (
  email: string,
): Promise<InvitationRow | null> => {
  const { rows } = await pool.query<InvitationRow>(
    `SELECT * FROM admin_invitations
     WHERE LOWER(email) = LOWER($1) AND status = 'pending'
     LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
};

/**
 * List invitations with role + inviter context for the dashboard table.
 * Defaults to pending but accepts any status filter.
 */
export const list = async (
  filter: { status?: InvitationStatus; limit: number; offset: number },
): Promise<{ rows: InvitationWithRoleRow[]; total: number }> => {
  const params: unknown[] = [];
  const whereParts: string[] = ['1 = 1'];

  if (filter.status) {
    params.push(filter.status);
    whereParts.push(`inv.status = $${params.length}`);
  }
  const where = whereParts.join(' AND ');

  const [{ rows }, countResult] = await Promise.all([
    pool.query<InvitationWithRoleRow>(
      `SELECT
         inv.*,
         r.name AS role_name,
         a.name AS inviter_name,
         a.email AS inviter_email
       FROM admin_invitations inv
       JOIN admin_roles r ON r.id = inv.role_id
       LEFT JOIN admins a ON a.id = inv.invited_by
       WHERE ${where}
       ORDER BY inv.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filter.limit, filter.offset],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM admin_invitations inv WHERE ${where}`,
      params,
    ),
  ]);

  return {
    rows,
    total: parseInt(countResult.rows[0]?.count ?? '0', 10),
  };
};

/** Revoke a pending invitation. Idempotent — already-revoked is a no-op. */
export const revoke = async (id: string): Promise<void> => {
  await pool.query(
    `UPDATE admin_invitations
     SET status = 'revoked', updated_at = NOW()
     WHERE id = $1 AND status = 'pending'`,
    [id],
  );
};

/**
 * Rotate token + extend expiry on a pending invitation (resend flow).
 * Returns the new raw token so the service can email it.
 */
export const rotateToken = async (
  id: string,
  newExpiresAt: Date,
): Promise<string | null> => {
  const raw = generateToken();
  const { rowCount } = await pool.query(
    `UPDATE admin_invitations
     SET token_hash = $2,
         expires_at = $3,
         updated_at = NOW()
     WHERE id = $1 AND status = 'pending'`,
    [id, hashToken(raw), newExpiresAt],
  );
  return rowCount === 1 ? raw : null;
};

/**
 * Mark an invitation as accepted. Run inside the same transaction that
 * creates the admin account so either both happen or neither does.
 */
export const markAccepted = async (
  id: string,
  adminId: string,
  client: PoolClient,
): Promise<void> => {
  await client.query(
    `UPDATE admin_invitations
     SET status = 'accepted',
         accepted_at = NOW(),
         accepted_as = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [id, adminId],
  );
};

/**
 * DTO for the dashboard's Invitations tab — hides token_hash and wraps
 * dates as ISO strings.
 */
export const toDTO = (row: InvitationWithRoleRow) => ({
  id: row.id,
  email: row.email,
  role: { id: row.role_id, name: row.role_name },
  status: row.status,
  invitedBy: row.invited_by
    ? { id: row.invited_by, name: row.inviter_name, email: row.inviter_email }
    : null,
  expiresAt: row.expires_at.toISOString(),
  acceptedAt: row.accepted_at?.toISOString() ?? null,
  createdAt: row.created_at.toISOString(),
});
