/**
 * AdminRole model — CRUD for custom admin roles + permission assignments.
 * Role-permission joins are managed alongside role mutations so the two
 * always stay in sync.
 *
 * Notes:
 * - `is_system = true` protects the seeded Super Admin role from update
 *   or delete — service layer enforces this, but the DB has no CHECK.
 * - Deletion cascades to role_permissions (FK ON DELETE CASCADE) but we
 *   still check `user_count > 0` before allowing it.
 */

import type { PoolClient } from 'pg';
import { pool } from '@/config/database';
import { withTransaction } from '@/utils/withTransaction';
import type { AdminRoleRow, AdminPermissionRow } from '@/types/admin';

// --------------------------------------------------------------------------
// Shapes
// --------------------------------------------------------------------------

export interface RoleListRow extends AdminRoleRow {
  permission_count: number;
  user_count: number;
}

export interface RoleDetail extends AdminRoleRow {
  permissions: AdminPermissionRow[];
}

// --------------------------------------------------------------------------
// Reads
// --------------------------------------------------------------------------

export const findAll = async (): Promise<RoleListRow[]> => {
  const { rows } = await pool.query<RoleListRow>(
    `SELECT
       r.*,
       (SELECT COUNT(*)::int FROM role_permissions rp WHERE rp.role_id = r.id) AS permission_count,
       (SELECT COUNT(*)::int FROM admins a WHERE a.role_id = r.id AND a.deleted_at IS NULL) AS user_count
     FROM admin_roles r
     ORDER BY r.is_system DESC, LOWER(r.name)`,
  );
  return rows;
};

export const findById = async (id: string): Promise<AdminRoleRow | null> => {
  const { rows } = await pool.query<AdminRoleRow>(
    `SELECT * FROM admin_roles WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
};

export const findByIdWithPermissions = async (id: string): Promise<RoleDetail | null> => {
  const role = await findById(id);
  if (!role) return null;

  const { rows: permissions } = await pool.query<AdminPermissionRow>(
    `SELECT p.id, p.key, p.label, p.category, p.description
     FROM admin_permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = $1
     ORDER BY p.category, p.label`,
    [id],
  );

  return { ...role, permissions };
};

export const findByName = async (
  name: string,
  excludeId?: string,
): Promise<AdminRoleRow | null> => {
  const params: unknown[] = [name];
  let query = `SELECT * FROM admin_roles WHERE LOWER(name) = LOWER($1)`;
  if (excludeId) {
    params.push(excludeId);
    query += ` AND id <> $2`;
  }
  query += ' LIMIT 1';

  const { rows } = await pool.query<AdminRoleRow>(query, params);
  return rows[0] ?? null;
};

export const countUsersWithRole = async (roleId: string): Promise<number> => {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM admins
     WHERE role_id = $1 AND deleted_at IS NULL`,
    [roleId],
  );
  return parseInt(rows[0]?.count ?? '0', 10);
};

// --------------------------------------------------------------------------
// Writes (all transactional)
// --------------------------------------------------------------------------

export interface CreateRoleInput {
  name: string;
  description: string | null;
  permissionKeys: string[];
  createdBy: string | null;
}

/**
 * Create a role and wire up its permissions in a single transaction.
 * Permission keys are resolved to UUIDs inside the same client so the
 * lookup + insert are atomic.
 */
export const create = async (input: CreateRoleInput): Promise<string> => {
  return withTransaction(async (client) => {
    const { rows: inserted } = await client.query<{ id: string }>(
      `INSERT INTO admin_roles (name, description, is_system, created_by)
       VALUES ($1, $2, FALSE, $3)
       RETURNING id`,
      [input.name, input.description, input.createdBy],
    );
    const roleId = inserted[0].id;
    await replacePermissions(client, roleId, input.permissionKeys);
    return roleId;
  });
};

export interface UpdateRoleInput {
  id: string;
  name?: string;
  description?: string | null;
  permissionKeys?: string[];
}

/**
 * Update fields + (optionally) replace the permission set in one transaction.
 * Only columns explicitly provided are touched.
 */
export const update = async (input: UpdateRoleInput): Promise<void> => {
  await withTransaction(async (client) => {
    if (input.name !== undefined || input.description !== undefined) {
      // Build dynamic SET clause based on which fields changed.
      const setClauses: string[] = ['updated_at = NOW()'];
      const params: unknown[] = [input.id];

      if (input.name !== undefined) {
        params.push(input.name);
        setClauses.push(`name = $${params.length}`);
      }
      if (input.description !== undefined) {
        params.push(input.description);
        setClauses.push(`description = $${params.length}`);
      }

      await client.query(
        `UPDATE admin_roles SET ${setClauses.join(', ')} WHERE id = $1`,
        params,
      );
    }

    if (input.permissionKeys !== undefined) {
      await replacePermissions(client, input.id, input.permissionKeys);
    }
  });
};

export const remove = async (id: string): Promise<void> => {
  // role_permissions has ON DELETE CASCADE, so this cleans up joins too.
  await pool.query(`DELETE FROM admin_roles WHERE id = $1`, [id]);
};

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/**
 * Wipe and re-insert a role's permissions. Runs inside a caller's
 * transaction to keep the role + its permissions atomic. Skips keys that
 * don't exist in admin_permissions (caller's responsibility to validate).
 */
const replacePermissions = async (
  client: PoolClient,
  roleId: string,
  permissionKeys: string[],
): Promise<void> => {
  await client.query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);

  if (permissionKeys.length === 0) return;

  // Resolve keys → IDs and insert in one round-trip using unnest.
  await client.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT $1, p.id
     FROM admin_permissions p
     WHERE p.key = ANY($2)`,
    [roleId, permissionKeys],
  );
};

// --------------------------------------------------------------------------
// DTO mappers
// --------------------------------------------------------------------------

export const listRowToDTO = (row: RoleListRow) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  isSystem: row.is_system,
  permissionCount: row.permission_count,
  userCount: row.user_count,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

export const detailRowToDTO = (row: RoleDetail) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  isSystem: row.is_system,
  permissions: row.permissions.map((p) => ({
    key: p.key,
    label: p.label,
    category: p.category,
  })),
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});
