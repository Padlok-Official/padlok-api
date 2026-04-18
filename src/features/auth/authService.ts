/**
 * authService — pure business logic for admin authentication.
 *
 * Controllers translate HTTP ↔ service calls; this module has no req/res
 * awareness. That makes it easy to unit test.
 */

import { env } from '@/config/env';
import { Unauthorized, Forbidden } from '@/utils/AppError';
import { verifyPassword } from '@/utils/password';
import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  generateJti,
  parseDurationToMs,
} from '@/utils/jwt';
import { setCachedAdmin, invalidateCachedAdmin } from '@/utils/adminCache';
import * as AdminModel from '@/models/Admin';
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
