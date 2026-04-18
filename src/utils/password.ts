/**
 * Password hashing utilities.
 *
 * - 12 bcrypt rounds: industry-standard, ~250ms on modern hardware.
 * - bcrypt.compare is timing-safe (always compares all bytes), which
 *   prevents timing attacks on password verification.
 * - We intentionally don't expose the salt or rounds to callers.
 */

import bcrypt from 'bcryptjs';

const ROUNDS = 12;

export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, ROUNDS);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);
