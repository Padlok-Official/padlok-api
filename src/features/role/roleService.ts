/**
 * roleService — business logic for custom admin roles.
 *
 * Key rules enforced here (not at the SQL layer):
 * - System roles (is_system=TRUE) cannot be updated or deleted.
 * - Role names are unique case-insensitively.
 * - A role can't be deleted while any admin is assigned to it.
 * - Every permission key must exist in admin_permissions.
 */

import * as AdminRoleModel from '@/models/AdminRole';
import * as AdminPermissionModel from '@/models/AdminPermission';
import * as AuditLogModel from '@/models/AdminAuditLog';
import { invalidateCachedAdmin } from '@/utils/adminCache';
import { redis } from '@/config/redis';
import { pool } from '@/config/database';
import {
  BadRequest,
  Conflict,
  Forbidden,
  NotFound,
} from '@/utils/AppError';

export interface CreateRoleInput {
  name: string;
  description: string | null;
  permissionKeys: string[];
}

export interface UpdateRoleInput {
  name?: string;
  description?: string | null;
  permissionKeys?: string[];
}

export interface Context {
  adminId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

const ensureKeysExist = async (keys: string[]): Promise<void> => {
  if (keys.length === 0) return;
  const resolved = await AdminPermissionModel.findIdsByKeys(keys);
  const unknown = keys.filter((k) => !resolved.has(k));
  if (unknown.length > 0) {
    throw BadRequest('Unknown permission keys', { unknownKeys: unknown });
  }
};

export const list = async () => {
  const rows = await AdminRoleModel.findAll();
  return rows.map(AdminRoleModel.listRowToDTO);
};

export const getById = async (id: string) => {
  const role = await AdminRoleModel.findByIdWithPermissions(id);
  if (!role) throw NotFound('Role not found');
  return AdminRoleModel.detailRowToDTO(role);
};

export const create = async (input: CreateRoleInput, ctx: Context) => {
  const name = input.name.trim();
  if (name.length < 2) throw BadRequest('Role name must be at least 2 characters');

  const existing = await AdminRoleModel.findByName(name);
  if (existing) throw Conflict(`A role named "${existing.name}" already exists`);

  await ensureKeysExist(input.permissionKeys);

  const roleId = await AdminRoleModel.create({
    name,
    description: input.description?.trim() || null,
    permissionKeys: input.permissionKeys,
    createdBy: ctx.adminId,
  });

  await AuditLogModel.record({
    adminId: ctx.adminId,
    action: 'role.create',
    entityType: 'role',
    entityId: roleId,
    details: { name, permissionCount: input.permissionKeys.length },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return getById(roleId);
};

export const update = async (id: string, input: UpdateRoleInput, ctx: Context) => {
  const role = await AdminRoleModel.findById(id);
  if (!role) throw NotFound('Role not found');
  if (role.is_system) throw Forbidden('System roles cannot be modified');

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 2) throw BadRequest('Role name must be at least 2 characters');
    const clash = await AdminRoleModel.findByName(name, id);
    if (clash) throw Conflict(`A role named "${clash.name}" already exists`);
  }

  if (input.permissionKeys !== undefined) {
    await ensureKeysExist(input.permissionKeys);
  }

  await AdminRoleModel.update({
    id,
    name: input.name?.trim(),
    description:
      input.description === undefined
        ? undefined
        : input.description?.trim() || null,
    permissionKeys: input.permissionKeys,
  });

  // Any admin with this role has a stale cached permission set. Wipe all.
  await invalidateAdminCachesForRole(id);

  await AuditLogModel.record({
    adminId: ctx.adminId,
    action: 'role.update',
    entityType: 'role',
    entityId: id,
    details: {
      changedFields: Object.keys(input),
      permissionCount: input.permissionKeys?.length,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return getById(id);
};

export const remove = async (id: string, ctx: Context): Promise<void> => {
  const role = await AdminRoleModel.findById(id);
  if (!role) throw NotFound('Role not found');
  if (role.is_system) throw Forbidden('System roles cannot be deleted');

  const userCount = await AdminRoleModel.countUsersWithRole(id);
  if (userCount > 0) {
    throw Conflict(
      `Cannot delete role: ${userCount} admin${userCount === 1 ? '' : 's'} still assigned`,
      { userCount },
    );
  }

  await AdminRoleModel.remove(id);

  await AuditLogModel.record({
    adminId: ctx.adminId,
    action: 'role.delete',
    entityType: 'role',
    entityId: id,
    details: { name: role.name },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
};

export const listPermissions = async () => {
  const permissions = await AdminPermissionModel.findAll();

  // Group by category for the dashboard's Create Role modal.
  const grouped = new Map<string, { category: string; permissions: Array<{ key: string; label: string; description: string | null }> }>();
  for (const p of permissions) {
    const existing = grouped.get(p.category) ?? { category: p.category, permissions: [] };
    existing.permissions.push({ key: p.key, label: p.label, description: p.description });
    grouped.set(p.category, existing);
  }
  return Array.from(grouped.values());
};

// --------------------------------------------------------------------------
// Cache invalidation helper
// --------------------------------------------------------------------------

/**
 * Invalidate the Redis cache for every admin currently holding this role.
 * Called after role updates so middleware fetches the fresh permission set
 * on the admin's next request instead of serving a stale cached value.
 */
const invalidateAdminCachesForRole = async (roleId: string): Promise<void> => {
  try {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM admins WHERE role_id = $1 AND deleted_at IS NULL`,
      [roleId],
    );
    await Promise.all(rows.map((r) => invalidateCachedAdmin(r.id)));
  } catch {
    // Best-effort — cache entries expire naturally in 5 minutes anyway.
  }
  // Silence lint about unused import
  void redis;
};
