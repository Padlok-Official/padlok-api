/**
 * Unit tests for the JWT utility.
 * No DB/Redis needed — pure functions.
 */

import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  generateJti,
  parseDurationToMs,
} from '@/utils/jwt';

describe('jwt utilities', () => {
  describe('signAccessToken / verifyToken', () => {
    it('round-trips a valid access token', () => {
      const token = signAccessToken({
        adminId: 'admin-1',
        email: 'a@b.com',
        roleId: 'role-1',
      });
      const payload = verifyToken(token, 'access');

      expect(payload.adminId).toBe('admin-1');
      expect(payload.email).toBe('a@b.com');
      expect(payload.roleId).toBe('role-1');
      expect(payload.type).toBe('access');
    });

    it('rejects a malformed token', () => {
      expect(() => verifyToken('not.a.jwt', 'access')).toThrow('Invalid or expired token');
    });

    it('rejects a refresh token when an access token is expected', () => {
      const refresh = signRefreshToken({ adminId: 'admin-1', jti: 'jti-1' });
      expect(() => verifyToken(refresh, 'access')).toThrow('Wrong token type');
    });

    it('rejects an access token when a refresh token is expected', () => {
      const access = signAccessToken({
        adminId: 'admin-1',
        email: 'a@b.com',
        roleId: 'role-1',
      });
      expect(() => verifyToken(access, 'refresh')).toThrow('Wrong token type');
    });
  });

  describe('signRefreshToken', () => {
    it('round-trips a valid refresh token', () => {
      const token = signRefreshToken({ adminId: 'admin-1', jti: 'jti-abc' });
      const payload = verifyToken(token, 'refresh');

      expect(payload.adminId).toBe('admin-1');
      expect(payload.jti).toBe('jti-abc');
      expect(payload.type).toBe('refresh');
    });
  });

  describe('generateJti', () => {
    it('produces 64 hex chars (32 bytes)', () => {
      const jti = generateJti();
      expect(jti).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces unique values on each call', () => {
      const a = generateJti();
      const b = generateJti();
      expect(a).not.toBe(b);
    });
  });

  describe('parseDurationToMs', () => {
    it.each([
      ['1s', 1_000],
      ['30s', 30_000],
      ['5m', 5 * 60_000],
      ['1h', 3_600_000],
      ['1d', 86_400_000],
      ['7d', 7 * 86_400_000],
      ['30d', 30 * 86_400_000],
      ['2w', 2 * 604_800_000],
      ['1y', 31_536_000_000],
    ])('%s → %d ms', (input, expected) => {
      expect(parseDurationToMs(input)).toBe(expected);
    });

    it('defaults a plain number to seconds', () => {
      expect(parseDurationToMs('10')).toBe(10_000);
    });

    it('throws on invalid input', () => {
      expect(() => parseDurationToMs('lol')).toThrow('Invalid duration');
    });
  });
});
