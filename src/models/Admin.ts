/**
 * Admin model — pure SQL data access for the `admins` table.
 * No business logic; all validation + hashing happens in the service layer.
 */

import type { PoolClient } from 'pg';
import { pool } from '@/config/database';
import type {
  AdminRow,
  AdminStatus,
  AdminDTO,
  AdminWithPermissions,
  AdminRoleRow,
} from '@/types/admin';

/**
 * Fetch admin + role + all their permission keys in one round-trip.
 * Used by the login flow and by the auth middleware on cache miss.
 *
 * The two LEFT JOINs to role_permissions → admin_permissions let us pull
 * the permission keys as a single Postgres array, avoiding N+1.
 */
export const findByEmailWithPermissions = async (
  email: string,
): Promise<AdminWithPermissions | null> => {
  const { rows } = await pool.query<
    AdminRow & {
      role_name: string;
      role_description: string | null;
      role_is_system: boolean;
      role_created_by: string | null;
      role_created_at: Date;
      role_updated_at: Date;
      permission_keys: string[] | null;
    }
  >(
    `SELECT
       a.*,
       r.name AS role_name,
       r.description AS role_description,
       r.is_system AS role_is_system,
       r.created_by AS role_created_by,
       r.created_at AS role_created_at,
       r.updated_at AS role_updated_at,
       COALESCE(ARRAY_AGG(p.key) FILTER (WHERE p.key IS NOT NULL), '{}') AS permission_keys
     FROM admins a
     JOIN admin_roles r ON r.id = a.role_id
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN admin_permissions p ON p.id = rp.permission_id
     WHERE LOWER(a.email) = LOWER($1) AND a.deleted_at IS NULL
     GROUP BY a.id, r.id
     LIMIT 1`,
    [email],
  );

  const row = rows[0];
  if (!row) return null;
  return splitAdminRow(row);
};

export const findByIdWithPermissions = async (
  id: string,
): Promise<AdminWithPermissions | null> => {
  const { rows } = await pool.query<
    AdminRow & {
      role_name: string;
      role_description: string | null;
      role_is_system: boolean;
      role_created_by: string | null;
      role_created_at: Date;
      role_updated_at: Date;
      permission_keys: string[] | null;
    }
  >(
    `SELECT
       a.*,
       r.name AS role_name,
       r.description AS role_description,
       r.is_system AS role_is_system,
       r.created_by AS role_created_by,
       r.created_at AS role_created_at,
       r.updated_at AS role_updated_at,
       COALESCE(ARRAY_AGG(p.key) FILTER (WHERE p.key IS NOT NULL), '{}') AS permission_keys
     FROM admins a
     JOIN admin_roles r ON r.id = a.role_id
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN admin_permissions p ON p.id = rp.permission_id
     WHERE a.id = $1 AND a.deleted_at IS NULL
     GROUP BY a.id, r.id
     LIMIT 1`,
    [id],
  );

  const row = rows[0];
  if (!row) return null;
  return splitAdminRow(row);
};

/**
 * Split the flat joined row back into { admin, role, permissions }.
 */
const splitAdminRow = (
  row: AdminRow & {
    role_name: string;
    role_description: string | null;
    role_is_system: boolean;
    role_created_by: string | null;
    role_created_at: Date;
    role_updated_at: Date;
    permission_keys: string[] | null;
  },
): AdminWithPermissions => {
  const {
    role_name,
    role_description,
    role_is_system,
    role_created_by,
    role_created_at,
    role_updated_at,
    permission_keys,
    ...adminCols
  } = row;

  const admin: AdminRow = adminCols;
  const role: AdminRoleRow = {
    id: admin.role_id,
    name: role_name,
    description: role_description,
    is_system: role_is_system,
    created_by: role_created_by,
    created_at: role_created_at,
    updated_at: role_updated_at,
  };

  // Postgres returns '{}' for the empty array aggregate — filter defensively.
  const permissions = (permission_keys ?? []).filter((k): k is string => !!k);

  return { admin, role, permissions };
};

export const updateLastLogin = async (
  adminId: string,
  ip: string | null,
): Promise<void> => {
  await pool.query(
    `UPDATE admins
     SET last_login_at = NOW(),
         last_active_at = NOW(),
         last_login_ip = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [adminId, ip],
  );
};

export const updateStatus = async (
  adminId: string,
  status: AdminStatus,
): Promise<void> => {
  await pool.query(
    `UPDATE admins SET status = $2, updated_at = NOW() WHERE id = $1`,
    [adminId, status],
  );
};

export const updatePassword = async (
  adminId: string,
  passwordHash: string,
  client?: PoolClient,
): Promise<void> => {
  const runner = client ?? pool;
  await runner.query(
    `UPDATE admins
     SET password_hash = $2,
         password_reset_token = NULL,
         password_reset_expires_at = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [adminId, passwordHash],
  );
};

export const createAdmin = async (
  input: {
    name: string;
    email: string;
    passwordHash: string;
    roleId: string;
    phoneNumber?: string | null;
    invitedBy?: string | null;
  },
  client?: PoolClient,
): Promise<AdminRow> => {
  const runner = client ?? pool;
  const { rows } = await runner.query<AdminRow>(
    `INSERT INTO admins (name, email, phone_number, password_hash, role_id, invited_by, status)
     VALUES ($1, LOWER($2), $3, $4, $5, $6, 'active')
     RETURNING *`,
    [
      input.name,
      input.email,
      input.phoneNumber ?? null,
      input.passwordHash,
      input.roleId,
      input.invitedBy ?? null,
    ],
  );
  return rows[0];
};

export const emailExists = async (email: string): Promise<boolean> => {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM admins WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL
     ) AS exists`,
    [email],
  );
  return rows[0]?.exists ?? false;
};

export const roleExists = async (roleId: string): Promise<boolean> => {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM admin_roles WHERE id = $1) AS exists`,
    [roleId],
  );
  return rows[0]?.exists ?? false;
};

/**
 * Build the safe public DTO from the joined admin+role+permissions tuple.
 * Explicitly omits password_hash, pin_hash, password_reset_token.
 */
export const toDTO = (awp: AdminWithPermissions): AdminDTO => ({
  id: awp.admin.id,
  name: awp.admin.name,
  email: awp.admin.email,
  phoneNumber: awp.admin.phone_number,
  avatarUrl: awp.admin.avatar_url,
  status: awp.admin.status,
  role: {
    id: awp.role.id,
    name: awp.role.name,
    description: awp.role.description,
    isSystem: awp.role.is_system,
  },
  permissions: awp.permissions,
  lastLoginAt: awp.admin.last_login_at?.toISOString() ?? null,
  createdAt: awp.admin.created_at.toISOString(),
});
