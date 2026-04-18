/**
 * authController — thin HTTP layer around authService.
 * Extracts context (IP, user agent) and returns standardized responses.
 */

import type { RequestHandler } from 'express';
import { ok } from '@/utils/respond';
import * as AdminModel from '@/models/Admin';
import * as authService from './authService';
import { Unauthorized } from '@/utils/AppError';

const ipFrom = (req: Parameters<RequestHandler>[0]): string | null => req.ip ?? null;
const uaFrom = (req: Parameters<RequestHandler>[0]): string | null =>
  (req.headers['user-agent'] as string | undefined) ?? null;

export const login: RequestHandler = async (req, res, next) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const result = await authService.login({
      email,
      password,
      ipAddress: ipFrom(req),
      userAgent: uaFrom(req),
    });
    return ok(res, result, 'Logged in');
  } catch (err) {
    next(err);
  }
};

export const me: RequestHandler = async (req, res, next) => {
  try {
    if (!req.admin) throw Unauthorized('Authentication required');
    return ok(res, { admin: AdminModel.toDTO(req.admin) });
  } catch (err) {
    next(err);
  }
};

export const refresh: RequestHandler = async (req, res, next) => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };
    const pair = await authService.refresh(refreshToken, {
      ipAddress: ipFrom(req),
      userAgent: uaFrom(req),
    });
    return ok(res, pair, 'Tokens refreshed');
  } catch (err) {
    next(err);
  }
};

export const logout: RequestHandler = async (req, res, next) => {
  try {
    if (!req.admin) throw Unauthorized('Authentication required');
    const { refreshToken } = req.body as { refreshToken?: string };
    await authService.logout(req.admin.admin.id, refreshToken ?? null, {
      ipAddress: ipFrom(req),
      userAgent: uaFrom(req),
    });
    return ok(res, null, 'Logged out');
  } catch (err) {
    next(err);
  }
};

export const acceptInvitation: RequestHandler = async (req, res, next) => {
  try {
    const { token, name, password } = req.body as {
      token: string;
      name: string;
      password: string;
    };
    const result = await authService.acceptInvitation({
      token,
      name,
      password,
      ipAddress: ipFrom(req),
      userAgent: uaFrom(req),
    });
    return ok(res, result, 'Welcome to PadLok', 201);
  } catch (err) {
    next(err);
  }
};
