import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '@/config/env';
import { Unauthorized } from './AppError';

export interface AdminTokenPayload {
  adminId: string;
  email: string;
  roleId: string;
  type: 'access' | 'refresh';
}

export const signAccessToken = (payload: Omit<AdminTokenPayload, 'type'>): string =>
  jwt.sign({ ...payload, type: 'access' }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  } as SignOptions);

export const signRefreshToken = (payload: Omit<AdminTokenPayload, 'type'>): string =>
  jwt.sign({ ...payload, type: 'refresh' }, env.jwt.secret, {
    expiresIn: env.jwt.refreshExpiresIn,
  } as SignOptions);

export const verifyToken = (token: string): AdminTokenPayload => {
  try {
    return jwt.verify(token, env.jwt.secret) as AdminTokenPayload;
  } catch {
    throw Unauthorized('Invalid or expired token');
  }
};
