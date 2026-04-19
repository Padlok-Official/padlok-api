/**
 * authService — pure business logic for admin authentication.
 *
 * Controllers translate HTTP ↔ service calls; this module has no req/res
 * awareness. That makes it easy to unit test.
 */

import { env } from '@/config/env';
import { BadRequest, Unauthorized, Forbidden } from '@/utils/AppError';
import { hashPassword, verifyPassword } from '@/utils/password';
import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  generateJti,
  parseDurationToMs,
} from '@/utils/jwt';
import { setCachedAdmin, invalidateCachedAdmin } from '@/utils/adminCache';
import { withTransaction } from '@/utils/withTransaction';
import * as AdminModel from '@/models/Admin';
import * as AdminInvitationModel from '@/models/AdminInvitation';
import * as RefreshTokenModel from '@/models/AdminRefreshToken';
import * as AuditLogModel from '@/models/AdminAuditLog';
import type { AdminDTO } from '@/types/admin';

export interface LoginInput {
  email: string;
  password: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends TokenPair {
  admin: AdminDTO;
}

/**
 * Attempt a login. Uses a generic error message for any failure so we don't
 * leak whether the email exists or the password was wrong (prevents user
 * enumeration). All attempts — success or failure — are audit logged.
 */
export const login = async (input: LoginInput): Promise<LoginResult> => {
  const email = input.email.trim().toLowerCase();
  const awp = await AdminModel.findByEmailWithPermissions(email);

  // Deliberately use the same error for "no such admin" vs "wrong password"
  // — and still run bcrypt on a dummy hash so timing stays constant.
  const genericFail = Unauthorized('Invalid email or password');

  if (!awp) {
    // Burn the same amount of CPU as a real compare so attackers can't tell
    // by timing whether the email exists.
    await verifyPassword(input.password, DUMMY_HASH);
    await AuditLogModel.record({
      adminId: null,
      action: 'auth.login.failed',
      details: { email, reason: 'unknown_email' },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    throw genericFail;
  }

  const passwordOk = await verifyPassword(input.password, awp.admin.password_hash);
  if (!passwordOk) {
    await AuditLogModel.record({
      adminId: awp.admin.id,
      action: 'auth.login.failed',
      details: { reason: 'wrong_password' },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    throw genericFail;
  }

  if (awp.admin.status === 'suspended') {
    await AuditLogModel.record({
      adminId: awp.admin.id,
      action: 'auth.login.blocked',
      details: { reason: 'suspended' },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    throw Forbidden('Your account has been suspended. Contact a super admin.');
  }

  // Issue the token pair
  const pair = await issueTokenPair(awp.admin.id, awp.admin.email, awp.admin.role_id, {
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  // Warm the cache so the next request skips the DB
  await setCachedAdmin(awp.admin.id, awp);
  await AdminModel.updateLastLogin(awp.admin.id, input.ipAddress);

  await AuditLogModel.record({
    adminId: awp.admin.id,
    action: 'auth.login.success',
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  return {
    ...pair,
    admin: AdminModel.toDTO(awp),
  };
};

/**
 * Exchange a valid refresh token for a new token pair.
 * Rotates: revokes the used token, issues a fresh pair.
 */
export const refresh = async (
  rawRefreshToken: string,
  context: { ipAddress: string | null; userAgent: string | null },
): Promise<TokenPair> => {
  const payload = verifyToken(rawRefreshToken, 'refresh');

  const row = await RefreshTokenModel.findActiveByRawToken(payload.adminId, payload.jti);
  if (!row) {
    // Possibly a stolen/reused token — audit and reject
    await AuditLogModel.record({
      adminId: payload.adminId,
      action: 'auth.refresh.rejected',
      details: { reason: 'token_not_found_or_revoked' },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    throw Unauthorized('Invalid refresh token');
  }

  const awp = await AdminModel.findByIdWithPermissions(payload.adminId);
  if (!awp || awp.admin.status === 'suspended') {
    throw Unauthorized('Account not accessible');
  }

  // Rotate: revoke the used token, issue a fresh pair
  await RefreshTokenModel.revoke(row.id);
  const pair = await issueTokenPair(awp.admin.id, awp.admin.email, awp.admin.role_id, context);

  await AuditLogModel.record({
    adminId: awp.admin.id,
    action: 'auth.refresh.success',
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  return pair;
};

/**
 * Logout a single session (revoke the refresh token the client holds).
 * Also invalidates the Redis cache so any stale sibling tabs re-check the DB.
 */
export const logout = async (
  adminId: string,
  rawRefreshToken: string | null,
  context: { ipAddress: string | null; userAgent: string | null },
): Promise<void> => {
  if (rawRefreshToken) {
    try {
      const payload = verifyToken(rawRefreshToken, 'refresh');
      const row = await RefreshTokenModel.findActiveByRawToken(payload.adminId, payload.jti);
      if (row) await RefreshTokenModel.revoke(row.id);
    } catch {
      // Token was garbage — still log out (the client will discard it)
    }
  }

  await invalidateCachedAdmin(adminId);
  await AuditLogModel.record({
    adminId,
    action: 'auth.logout',
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
};

/**
 * Preview an invitation by raw token — read-only lookup used by the
 * accept-invite page to render "invited by X as Y" before the invitee
 * submits their name + password.
 *
 * Returns a tight DTO with no sensitive fields. If the token is invalid
 * in any way, throws BadRequest with a typed `reason` so the frontend
 * can render the appropriate error state (expired / accepted / revoked /
 * not_found).
 */
export interface InvitationPreview {
  email: string;
  roleName: string;
  roleDescription: string | null;
  inviterName: string;
  expiresAt: string;
}

export type InvitationInvalidReason =
  | 'not_found'
  | 'expired'
  | 'accepted'
  | 'revoked';

export const getInvitationPreview = async (
  rawToken: string,
): Promise<InvitationPreview> => {
  const ctx = await AdminInvitationModel.findByRawTokenWithContext(rawToken);
  if (!ctx) {
    throw BadRequest('Invitation not found', { reason: 'not_found' as InvitationInvalidReason });
  }

  if (ctx.invitation.status === 'accepted') {
    throw BadRequest('This invitation has already been accepted', {
      reason: 'accepted' as InvitationInvalidReason,
    });
  }
  if (ctx.invitation.status === 'revoked') {
    throw BadRequest('This invitation has been revoked', {
      reason: 'revoked' as InvitationInvalidReason,
    });
  }
  // Pending-but-past-expiry is a soft-expired state: we still produce the
  // typed 'expired' reason rather than relying on the invitation's own
  // status column (which would require a separate sweep to set).
  if (ctx.invitation.expires_at < new Date()) {
    throw BadRequest('This invitation has expired', {
      reason: 'expired' as InvitationInvalidReason,
    });
  }
  if (ctx.invitation.status !== 'pending') {
    // Safety net — status enum should be exhaustive above.
    throw BadRequest('Invitation is not valid', {
      reason: 'not_found' as InvitationInvalidReason,
    });
  }

  return {
    email: ctx.invitation.email,
    roleName: ctx.role.name,
    roleDescription: ctx.role.description,
    inviterName: ctx.inviter?.name ?? 'A PadLok admin',
    expiresAt: ctx.invitation.expires_at.toISOString(),
  };
};

/**
 * Consume an invitation: validate the token, create the admin with the
 * role baked into the invitation, mark the invitation accepted, and
 * return a fresh token pair so the new admin is logged in immediately.
 *
 * All writes run in a single transaction so we never end up with a
 * created admin + unmarked invitation (or vice versa).
 */
export interface AcceptInvitationInput {
  token: string;
  name: string;
  password: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export const acceptInvitation = async (
  input: AcceptInvitationInput,
): Promise<LoginResult> => {
  const invitation = await AdminInvitationModel.findByRawToken(input.token);
  if (!invitation) throw BadRequest('Invalid or expired invitation');

  if (invitation.status !== 'pending') {
    throw BadRequest(`Invitation is already ${invitation.status}`);
  }
  if (invitation.expires_at < new Date()) {
    throw BadRequest('Invitation has expired — ask for a new one');
  }

  // Create admin + mark invitation accepted atomically
  const passwordHash = await hashPassword(input.password);
  const adminId = await withTransaction(async (client) => {
    // Double-check email isn't already taken (race protection)
    const existing = await client.query(
      `SELECT id FROM admins WHERE LOWER(email) = $1 AND deleted_at IS NULL LIMIT 1`,
      [invitation.email],
    );
    if (existing.rows.length > 0) {
      throw new Error('Email already taken');
    }

    const admin = await AdminModel.createAdmin(
      {
        name: input.name.trim(),
        email: invitation.email,
        passwordHash,
        roleId: invitation.role_id,
        invitedBy: invitation.invited_by,
      },
      client,
    );
    await AdminInvitationModel.markAccepted(invitation.id, admin.id, client);
    return admin.id;
  });

  await AuditLogModel.record({
    adminId,
    action: 'auth.invitation.accepted',
    entityType: 'invitation',
    entityId: invitation.id,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  // Load the fresh admin with permissions + issue tokens
  const awp = await AdminModel.findByIdWithPermissions(adminId);
  if (!awp) throw new Error('Admin creation succeeded but lookup failed');

  const pair = await issueTokenPair(awp.admin.id, awp.admin.email, awp.admin.role_id, {
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
  await setCachedAdmin(awp.admin.id, awp);
  await AdminModel.updateLastLogin(awp.admin.id, input.ipAddress);

  return {
    ...pair,
    admin: AdminModel.toDTO(awp),
  };
};

/**
 * Revoke EVERY active refresh token for an admin. Useful for forced logout
 * on password change, role change, or security incidents.
 */
export const logoutAllSessions = async (adminId: string): Promise<number> => {
  const revoked = await RefreshTokenModel.revokeAllForAdmin(adminId);
  await invalidateCachedAdmin(adminId);
  await AuditLogModel.record({
    adminId,
    action: 'auth.logout.all',
    details: { revokedCount: revoked },
  });
  return revoked;
};

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/**
 * Dummy bcrypt hash — used for timing-safe comparison when the email
 * doesn't exist. This is "password" hashed at 12 rounds.
 */
const DUMMY_HASH =
  '$2a$12$CwTycUXWue0Thq9StjUM0uJ8gNvdGSo5qQCL4SZqLfjqd.w9AQDvq';

const issueTokenPair = async (
  adminId: string,
  email: string,
  roleId: string,
  context: { ipAddress: string | null; userAgent: string | null },
): Promise<TokenPair> => {
  const jti = generateJti();
  const accessToken = signAccessToken({ adminId, email, roleId });
  const refreshToken = signRefreshToken({ adminId, jti });

  const expiresAt = new Date(Date.now() + parseDurationToMs(env.jwt.refreshExpiresIn));
  await RefreshTokenModel.create({
    adminId,
    rawToken: jti,
    expiresAt,
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
  });

  return { accessToken, refreshToken };
};
