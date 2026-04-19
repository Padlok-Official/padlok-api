import type { RequestHandler } from 'express';
import { ok } from '@/utils/respond';
import { Unauthorized } from '@/utils/AppError';
import * as roleService from './roleService';

const ctxFrom = (req: Parameters<RequestHandler>[0]) => {
  if (!req.admin) throw Unauthorized('Authentication required');
  return {
    adminId: req.admin.admin.id,
    ipAddress: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  };
};

export const list: RequestHandler = async (_req, res, next) => {
  try {
    const roles = await roleService.list();
    return ok(res, { roles });
  } catch (err) {
    next(err);
  }
};

export const getById: RequestHandler = async (req, res, next) => {
  try {
    const role = await roleService.getById(req.params.id);
    return ok(res, { role });
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    const ctx = ctxFrom(req);
    const role = await roleService.create(req.body, ctx);
    return ok(res, { role }, 'Role created', 201);
  } catch (err) {
    next(err);
  }
};

export const update: RequestHandler = async (req, res, next) => {
  try {
    const ctx = ctxFrom(req);
    const role = await roleService.update(req.params.id, req.body, ctx);
    return ok(res, { role }, 'Role updated');
  } catch (err) {
    next(err);
  }
};

export const remove: RequestHandler = async (req, res, next) => {
  try {
    const ctx = ctxFrom(req);
    await roleService.remove(req.params.id, ctx);
    return ok(res, null, 'Role deleted');
  } catch (err) {
    next(err);
  }
};

export const listPermissions: RequestHandler = async (_req, res, next) => {
  try {
    const categories = await roleService.listPermissions();
    return ok(res, { categories });
  } catch (err) {
    next(err);
  }
};
