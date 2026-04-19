/**
 * adminService — business logic for admin account management:
 * invitations, listing, updates, soft-delete. The accept-invite flow
 * itself lives in authService (it issues tokens).
 *
 * Invariants enforced here (not at the SQL layer):
 * - Can't invite an email that already belongs to an active admin.
 * - Can't have two pending invites for the same email simultaneously.
 * - Can't delete yourself (prevents accidental lockout).
 * - Can't demote the last Super Admin (platform always has one).
 * - Role updates invalidate the Redis permissions cache for that admin.
 */

import { pool } from '@/config/database';
import type { AdminStatus } from '@/types/admin';
import * as AdminModel from '@/models/Admin';
import * as AdminRoleModel from '@/models/AdminRole';
import * as AdminInvitationModel from '@/models/AdminInvitation';
import * as AuditLogModel from '@/models/AdminAuditLog';
import { invalidateCachedAdmin } from '@/utils/adminCache';
import {
  sendInvitation as sendInvitationEmail,
  type SendInvitationResult,
} from '@/infrastructure/email/emailService';
import {
  BadRequest,
  Conflict,
  Forbidden,
  NotFound,
} from '@/utils/AppError';

const INVITATION_TTL_DAYS = 7;

export interface Context {
  adminId: string;
  adminName: string;
  ipAddress: string | null;
  userAgent: string | null;
}

// --------------------------------------------------------------------------
// Invitation flow
// --------------------------------------------------------------------------

export interface InviteInput {
  email: string;
  roleId: string;
}

export interface InviteResult {
  invitationId: string;
  email: string;
  roleName: string;
  expiresAt: string;
  emailResult: SendInvitationResult;
}

export const invite = async (input: InviteInput, ctx: Context): Promise<InviteResult> => {
  const email = input.email.trim().toLowerCase();

  // 1. Role must exist
  const role = await AdminRoleModel.findById(input.roleId);
  if (!role) throw BadRequest('Selected role does not exist');

  // 2. No existing active admin with this email
  const existing = await pool.query(
    `SELECT id FROM admins WHERE LOWER(email) = $1 AND deleted_at IS NULL LIMIT 1`,
    [email],
  );
  if (existing.rows.length > 0) {
    throw Conflict('An admin with that email already exists');
  }

  // 3. No pending invitation for this email (unique index enforces, but
  //    produce a clean error rather than relying on the DB to throw).
  const pending = await AdminInvitationModel.findPendingByEmail(email);
  if (pending) {
    throw Conflict('A pending invitation for that email already exists', {
      invitationId: pending.id,
    });
  }

  // 4. Generate token + persist
  const rawToken = AdminInvitationModel.generateToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000);

  const invitationId = await AdminInvitationModel.create({
    email,
    roleId: role.id,
    rawToken,
    invitedBy: ctx.adminId,
    expiresAt,
  });

  // 5. Send email (best-effort — even if it fails, the row exists)
  const emailResult = await sendInvitationEmail({
    to: email,
    roleName: role.name,
    inviterName: ctx.adminName,
    rawToken,
  });

  await AuditLogModel.record({
    adminId: ctx.adminId,
    action: 'admin.invite',
    entityType: 'invitation',
    entityId: invitationId,
    details: { email, roleId: role.id, roleName: role.name },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return {
    invitationId,
    email,
    roleName: role.name,
    expiresAt: expiresAt.toISOString(),
    emailResult,
  };
};

export const listInvitations = async (params: {
  status?: 'pending' | 'accepted' | 'expired' | 'revoked';
  page: number;
  limit: number;
}) => {
  const offset = (params.page - 1) * params.limit;
  const { rows, total } = await AdminInvitationModel.list({
    status: params.status,
    limit: params.limit,
    offset,
  });
  return {
    invitations: rows.map(AdminInvitationModel.toDTO),
    total,
  };
};

export const resendInvitation = async (id: string, ctx: Context) => {
  const invitation = await AdminInvitationModel.findById(id);
  if (!invitation) throw NotFound('Invitation not found');
  if (invitation.status !== 'pending') {
    throw BadRequest(`Cannot resend a ${invitation.status} invitation`);
  }

  const role = await AdminRoleModel.findById(invitation.role_id);
  if (!role) throw BadRequest('Role no longer exists');

  const newExpiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000);
  const rawToken = await AdminInvitationModel.rotateToken(id, newExpiresAt);
  if (!rawToken) throw NotFound('Invitation could not be rotated');

  const emailResult = await sendInvitationEmail({
    to: invitation.email,
    roleName: role.name,
    inviterName: ctx.adminName,
    rawToken,
  });

  await AuditLogModel.record({
    adminId: ctx.adminId,
    action: 'admin.invitation.resend',
    entityType: 'invitation',
    entityId: id,
    details: { email: invitation.email },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return { emailResult, expiresAt: newExpiresAt.toISOString() };
};

export const revokeInvitation = async (id: string, ctx: Context) => {
  const invitation = await AdminInvitationModel.findById(id);
  if (!invitation) throw NotFound('Invitation not found');
  if (invitation.status !== 'pending') {
    throw BadRequest(`Invitation is already ${invitation.status}`);
  }

  await AdminInvitationModel.revoke(id);
  await AuditLogModel.record({
    adminId: ctx.adminId,
    action: 'admin.invitation.revoke',
    entityType: 'invitation',
    entityId: id,
    details: { email: invitation.email },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
};

// --------------------------------------------------------------------------
// Admin CRUD
// --------------------------------------------------------------------------

interface AdminListFilter {
  search?: string;
  roleId?: string;
  status?: AdminStatus;
  page: number;
  limit: number;
}

export const listAdmins = async (filter: AdminListFilter) => {
  const where: string[] = ['a.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (filter.search) {
    params.push(`%${filter.search.toLowerCase()}%`);
    where.push(`(LOWER(a.name) LIKE $${params.length} OR LOWER(a.email) LIKE $${params.length})`);
  }
  if (filter.roleId) {
    params.push(filter.roleId);
    where.push(`a.role_id = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`a.status = $${params.length}`);
  }

  const whereClause = where.join(' AND ');
  const offset = (filter.page - 1) * filter.limit;

  const [{ rows }, countResult] = await Promise.all([
    pool.query<{
      id: string;
      name: string;
      email: string;
      avatar_url: string | null;
      status: AdminStatus;
      last_active_at: Date | null;
      last_login_at: Date | null;
      created_at: Date;
      role_id: string;
      role_name: string;
    }>(
      `SELECT a.id, a.name, a.email, a.avatar_url, a.status,
              a.last_active_at, a.last_login_at, a.created_at,
              a.role_id, r.name AS role_name
       FROM admins a
       JOIN admin_roles r ON r.id = a.role_id
       WHERE ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filter.limit, offset],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM admins a WHERE ${whereClause}`,
      params,
    ),
  ]);

  return {
    admins: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      avatarUrl: r.avatar_url,
      status: r.status,
      role: { id: r.role_id, name: r.role_name },
      lastActiveAt: r.last_active_at?.toISOString() ?? null,
      lastLoginAt: r.last_login_at?.toISOString() ?? null,
      createdAt: r.created_at.toISOString(),
    })),
    total: parseInt(countResult.rows[0]?.count ?? '0', 10),
  };
};

export const getAdmin = async (id: string) => {
  const awp = await AdminModel.findByIdWithPermissions(id);
  if (!awp) throw NotFound('Admin not found');
  return AdminModel.toDTO(awp);
};

export interface UpdateAdminInput {
  name?: string;
  status?: AdminStatus;
  roleId?: string;
}

export const updateAdmin = async (id: string, input: UpdateAdminInput, ctx: Context) => {
  const target = await AdminModel.findByIdWithPermissions(id);
  if (!target) throw NotFound('Admin not found');

  // Safety: can't demote the last Super Admin away from that role
  if (input.roleId && target.role.is_system && input.roleId !== target.role.id) {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM admins
       WHERE role_id = $1 AND deleted_at IS NULL`,
      [target.role.id],
    );
    if (parseInt(rows[0]?.count ?? '0', 10) <= 1) {
      throw Forbidden('Cannot demote the last Super Admin');
    }
  }

  const updates: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [id];

  if (input.name !== undefined) {
    params.push(input.name.trim());
    updates.push(`name = $${params.length}`);
  }
  if (input.status !== undefined) {
    params.push(input.status);
    updates.push(`status = $${params.length}`);
  }
  if (input.roleId !== undefined) {
    const role = await AdminRoleModel.findById(input.roleId);
    if (!role) throw BadRequest('Selected role does not exist');
    params.push(input.roleId);
    updates.push(`role_id = $${params.length}`);
  }

  await pool.query(
    `UPDATE admins SET ${updates.join(', ')} WHERE id = $1`,
    params,
  );

  await invalidateCachedAdmin(id);
  await AuditLogModel.record({
    adminId: ctx.adminId,
    action: 'admin.update',
    entityType: 'admin',
    entityId: id,
    details: { changedFields: Object.keys(input) },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return getAdmin(id);
};

export const softDeleteAdmin = async (id: string, ctx: Context) => {
  if (id === ctx.adminId) {
    throw Forbidden('You cannot delete your own account');
  }

  const target = await AdminModel.findByIdWithPermissions(id);
  if (!target) throw NotFound('Admin not found');

  // Protect the last Super Admin
  if (target.role.is_system) {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM admins
       WHERE role_id = $1 AND deleted_at IS NULL`,
      [target.role.id],
    );
    if (parseInt(rows[0]?.count ?? '0', 10) <= 1) {
      throw Forbidden('Cannot delete the last Super Admin');
    }
  }

  await pool.query(
    `UPDATE admins
     SET deleted_at = NOW(), status = 'inactive', updated_at = NOW()
     WHERE id = $1`,
    [id],
  );
  await invalidateCachedAdmin(id);

  await AuditLogModel.record({
    adminId: ctx.adminId,
    action: 'admin.delete',
    entityType: 'admin',
    entityId: id,
    details: { email: target.admin.email, roleName: target.role.name },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
};
