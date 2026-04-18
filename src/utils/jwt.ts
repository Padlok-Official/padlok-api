/**
 * JWT helpers for admin authentication.
 *
 * Design notes:
 * - Access tokens carry `{adminId, email, roleId, type:'access'}` in the
 *   payload. The middleware trusts JWT verification but still loads the
 *   admin (from Redis cache) to check status + permissions.
 * - Refresh tokens carry `{adminId, jti, type:'refresh'}`. The `jti` is a
 *   random 32-byte hex string that we bcrypt-hash into the DB. We verify
 *   the JWT signature first (cheap), then confirm the jti matches a live
 *   row (timing-safe bcrypt.compare). Stops attackers who somehow obtain
 *   a valid JWT but can't match the DB hash.
 * - Token `type` is ALWAYS checked after verification to prevent using a
 *   refresh token as an access token (or vice versa).
 */

import jwt, { type SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '@/config/env';
import { Unauthorized } from './AppError';

export interface AccessTokenPayload {
  adminId: string;
  email: string;
  roleId: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  adminId: string;
  jti: string;
  type: 'refresh';
}

export type TokenPayload = AccessTokenPayload | RefreshTokenPayload;

export const signAccessToken = (
  payload: Omit<AccessTokenPayload, 'type'>,
): string =>
  jwt.sign({ ...payload, type: 'access' }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
    issuer: 'padlok-api',
    audience: 'padlok-dashboard',
  } as SignOptions);

export const signRefreshToken = (
  payload: Omit<RefreshTokenPayload, 'type'>,
): string =>
  jwt.sign({ ...payload, type: 'refresh' }, env.jwt.secret, {
    expiresIn: env.jwt.refreshExpiresIn,
    issuer: 'padlok-api',
    audience: 'padlok-dashboard',
  } as SignOptions);

/**
 * Verify a token's signature + expiry AND assert its `type` claim.
 * Throws Unauthorized on any mismatch — use expectedType to prevent
 * cross-type reuse attacks (e.g. using a refresh token as an access token).
 */
export const verifyToken = <T extends TokenPayload['type']>(
  token: string,
  expectedType: T,
): Extract<TokenPayload, { type: T }> => {
  let decoded: TokenPayload;
  try {
    decoded = jwt.verify(token, env.jwt.secret, {
      issuer: 'padlok-api',
      audience: 'padlok-dashboard',
    }) as TokenPayload;
  } catch {
    throw Unauthorized('Invalid or expired token');
  }

  if (decoded.type !== expectedType) {
    throw Unauthorized('Wrong token type');
  }
  return decoded as Extract<TokenPayload, { type: T }>;
};

/**
 * Generate a cryptographically strong random JWT ID (32 bytes → 64 hex chars).
 * Used as the refresh token's `jti`; stored bcrypt-hashed in the DB.
 */
export const generateJti = (): string => crypto.randomBytes(32).toString('hex');

/**
 * Parse an env string like "30d", "1h", "3600" into milliseconds.
 * Used to compute refresh token expiry timestamps for the DB row.
 */
export const parseDurationToMs = (duration: string): number => {
  const match = duration.match(/^(\d+)([smhdwy]?)$/);
  if (!match) throw new Error(`Invalid duration: ${duration}`);
  const n = parseInt(match[1], 10);
  const unit = match[2] || 's';
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
    y: 31_536_000_000,
  };
  return n * (multipliers[unit] ?? 1000);
};
