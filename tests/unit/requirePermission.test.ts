/**
 * Unit tests for requirePermission / requireAnyPermission middleware.
 * Mocks req/res/next manually — no framework dependencies.
 */

import type { Request, Response, NextFunction } from 'express';
import { requirePermission, requireAnyPermission } from '@/middleware/requirePermission';
import { AppError } from '@/utils/AppError';
import type { AdminWithPermissions } from '@/types/admin';

const makeAdminReq = (permissions: string[] = []): Partial<Request> => ({
  admin: {
    admin: { id: 'a1' } as AdminWithPermissions['admin'],
    role: { id: 'r1' } as AdminWithPermissions['role'],
    permissions,
  } as AdminWithPermissions,
  adminPermissions: new Set(permissions),
});

const exerciseMiddleware = (
  mw: ReturnType<typeof requirePermission>,
  req: Partial<Request>,
): { err?: unknown; called: boolean } => {
  let err: unknown;
  let called = false;
  const res = {} as Response;
  const next: NextFunction = (e?: unknown) => {
    called = true;
    err = e;
  };
  mw(req as Request, res, next);
  return { err, called };
};

describe('requirePermission', () => {
  it('calls next() when the single required permission is present', () => {
    const req = makeAdminReq(['view_disputes']);
    const { err, called } = exerciseMiddleware(requirePermission('view_disputes'), req);
    expect(called).toBe(true);
    expect(err).toBeUndefined();
  });

  it('calls next(Forbidden) when the required permission is missing', () => {
    const req = makeAdminReq(['view_users']);
    const { err } = exerciseMiddleware(requirePermission('resolve_disputes'), req);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
    expect((err as AppError).message).toContain('resolve_disputes');
  });

  it('requires ALL permissions when an array is passed', () => {
    const reqWithBoth = makeAdminReq(['view_disputes', 'resolve_disputes']);
    expect(
      exerciseMiddleware(requirePermission(['view_disputes', 'resolve_disputes']), reqWithBoth).err,
    ).toBeUndefined();

    const reqWithOne = makeAdminReq(['view_disputes']);
    const result = exerciseMiddleware(
      requirePermission(['view_disputes', 'resolve_disputes']),
      reqWithOne,
    );
    expect(result.err).toBeInstanceOf(AppError);
    expect((result.err as AppError).message).toContain('resolve_disputes');
  });

  it('calls next(Unauthorized) when admin is not attached', () => {
    const { err } = exerciseMiddleware(requirePermission('view_users'), {});
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(401);
  });
});

describe('requireAnyPermission', () => {
  it('passes when at least one permission is held', () => {
    const req = makeAdminReq(['view_disputes']);
    const { err } = exerciseMiddleware(
      requireAnyPermission(['view_disputes', 'resolve_disputes']),
      req,
    );
    expect(err).toBeUndefined();
  });

  it('rejects when none are held', () => {
    const req = makeAdminReq(['view_users']);
    const { err } = exerciseMiddleware(
      requireAnyPermission(['view_disputes', 'resolve_disputes']),
      req,
    );
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
  });
});
