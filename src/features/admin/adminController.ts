import type { RequestHandler } from 'express';
import { ok, paginated } from '@/utils/respond';
import { parsePagination } from '@/utils/pagination';
import { Unauthorized } from '@/utils/AppError';
import type { AdminStatus } from '@/types/admin';
import * as adminService from './adminService';

const ctxFrom = (req: Parameters<RequestHandler>[0]) => {
  if (!req.admin) throw Unauthorized('Authentication required');
  return {
    adminId: req.admin.admin.id,
    adminName: req.admin.admin.name,
    ipAddress: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  };
};

// --- Invitations -----------------------------------------------------------

export const invite: RequestHandler = async (req, res, next) => {
  try {
    const ctx = ctxFrom(req);
    const result = await adminService.invite(req.body, ctx);
    return ok(res, result, 'Invitation sent', 201);
  } catch (err) {
    next(err);
  }
};

export const listInvitations: RequestHandler = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req, { defaultLimit: 20 });
    const { invitations, total } = await adminService.listInvitations({
      status: req.query.status as 'pending' | 'accepted' | 'expired' | 'revoked' | undefined,
      page,
      limit,
    });
    return paginated(res, invitations, { page, limit, total });
  } catch (err) {
    next(err);
  }
};

export const resendInvitation: RequestHandler = async (req, res, next) => {
  try {
    const ctx = ctxFrom(req);
    const result = await adminService.resendInvitation(req.params.id, ctx);
    return ok(res, result, 'Invitation resent');
  } catch (err) {
    next(err);
  }
};

export const revokeInvitation: RequestHandler = async (req, res, next) => {
  try {
    const ctx = ctxFrom(req);
    await adminService.revokeInvitation(req.params.id, ctx);
    return ok(res, null, 'Invitation revoked');
  } catch (err) {
    next(err);
  }
};

// --- Admin accounts --------------------------------------------------------

export const listAdmins: RequestHandler = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req, { defaultLimit: 20 });
    const { admins, total } = await adminService.listAdmins({
      search: req.query.search as string | undefined,
      roleId: req.query.roleId as string | undefined,
      status: req.query.status as AdminStatus | undefined,
      page,
      limit,
    });
    return paginated(res, admins, { page, limit, total });
  } catch (err) {
    next(err);
  }
};

export const getAdmin: RequestHandler = async (req, res, next) => {
  try {
    const admin = await adminService.getAdmin(req.params.id);
    return ok(res, { admin });
  } catch (err) {
    next(err);
  }
};

export const updateAdmin: RequestHandler = async (req, res, next) => {
  try {
    const ctx = ctxFrom(req);
    const admin = await adminService.updateAdmin(req.params.id, req.body, ctx);
    return ok(res, { admin }, 'Admin updated');
  } catch (err) {
    next(err);
  }
};

export const deleteAdmin: RequestHandler = async (req, res, next) => {
  try {
    const ctx = ctxFrom(req);
    await adminService.softDeleteAdmin(req.params.id, ctx);
    return ok(res, null, 'Admin deleted');
  } catch (err) {
    next(err);
  }
};
