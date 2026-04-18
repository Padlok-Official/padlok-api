/**
 * AdminPermission model — read-only catalog of every capability key the
 * system recognizes. Seeded via `npm run migrate:seed`; never mutated at
 * runtime, so no create/update/delete methods here.
 */

import { pool } from '@/config/database';
import type { AdminPermissionRow } from '@/types/admin';

export const findAll = async (): Promise<AdminPermissionRow[]> => {
  const { rows } = await pool.query<AdminPermissionRow>(
    `SELECT id, key, label, category, description
     FROM admin_permissions
     ORDER BY category, label`,
  );
  return rows;
};

/** Map permission keys → UUIDs in one query (used when creating roles). */
export const findIdsByKeys = async (
  keys: string[],
): Promise<Map<string, string>> => {
  if (keys.length === 0) return new Map();
  const { rows } = await pool.query<{ id: string; key: string }>(
    `SELECT id, key FROM admin_permissions WHERE key = ANY($1)`,
    [keys],
  );
  return new Map(rows.map((r) => [r.key, r.id]));
};
