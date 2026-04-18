/**
 * Seed script — run AFTER migrations.
 *
 * Idempotent: can be re-run safely. It:
 *   1. Inserts every permission from the canonical list (skips existing keys)
 *   2. Ensures a "Super Admin" system role exists and has ALL permissions
 *   3. Creates the bootstrap Super Admin account if missing
 *      (email + password read from env — prints warning if defaults used)
 *
 * Usage: `npm run migrate:seed`
 *
 * Env vars:
 *   SEED_SUPER_ADMIN_EMAIL     (default: admin@padlok.com)
 *   SEED_SUPER_ADMIN_PASSWORD  (default: ChangeMe123! — WARNING)
 *   SEED_SUPER_ADMIN_NAME      (default: "Super Admin")
 */

import bcrypt from 'bcryptjs';
import { pool, closeDatabase } from '@/config/database';
import { logger } from '@/utils/logger';

interface PermissionSeed {
  key: string;
  label: string;
  category: string;
}

const PERMISSIONS: PermissionSeed[] = [
  // Financial Analysis
  { key: 'view_revenue', label: 'View Revenue Reports', category: 'Financial Analysis' },
  { key: 'view_forecasts', label: 'View Financial Forecasts', category: 'Financial Analysis' },
  { key: 'export_financials', label: 'Export Financial Data', category: 'Financial Analysis' },
  { key: 'manage_escrow', label: 'Manage Escrow Funds', category: 'Financial Analysis' },
  { key: 'release_funds', label: 'Release Funds', category: 'Financial Analysis' },
  { key: 'process_refunds', label: 'Process Refunds', category: 'Financial Analysis' },

  // User Management
  { key: 'view_users', label: 'View User Profiles', category: 'User Management' },
  { key: 'edit_users', label: 'Edit User Information', category: 'User Management' },
  { key: 'suspend_users', label: 'Suspend / Ban Users', category: 'User Management' },
  { key: 'verify_kyc', label: 'Verify KYC Documents', category: 'User Management' },
  { key: 'flag_users', label: 'Flag Users', category: 'User Management' },

  // Transaction Management
  { key: 'view_transactions', label: 'View Transactions', category: 'Transaction Management' },
  { key: 'create_orders', label: 'Create Orders', category: 'Transaction Management' },
  { key: 'update_orders', label: 'Update Orders', category: 'Transaction Management' },
  { key: 'delete_orders', label: 'Delete Orders', category: 'Transaction Management' },
  { key: 'view_analytics', label: 'View Analytics', category: 'Transaction Management' },

  // Dispute Management
  { key: 'view_disputes', label: 'View Disputes', category: 'Dispute Management' },
  { key: 'resolve_disputes', label: 'Resolve Disputes', category: 'Dispute Management' },
  { key: 'review_evidence', label: 'Review Evidence', category: 'Dispute Management' },
  { key: 'apply_flags', label: 'Apply Dispute Flags', category: 'Dispute Management' },

  // Communication
  { key: 'send_messages', label: 'Send Messages', category: 'Communication' },
  { key: 'view_messages', label: 'View Messages', category: 'Communication' },
  { key: 'send_notifications', label: 'Send Push Notifications', category: 'Communication' },
  { key: 'send_sms', label: 'Send SMS', category: 'Communication' },
  { key: 'send_email', label: 'Send Emails', category: 'Communication' },

  // Administration
  { key: 'view_activity_log', label: 'View Activity Log', category: 'Administration' },
  { key: 'manage_branches', label: 'Manage Branches', category: 'Administration' },
  { key: 'create_branch', label: 'Create Branch', category: 'Administration' },
  { key: 'delete_branch', label: 'Delete Branch', category: 'Administration' },
  { key: 'manage_admins', label: 'Manage Admin Accounts', category: 'Administration' },
  { key: 'manage_roles', label: 'Manage Roles & Permissions', category: 'Administration' },
];

const SUPER_ADMIN_ROLE_NAME = 'Super Admin';
const SUPER_ADMIN_ROLE_DESCRIPTION = 'Full platform access — manage all users, roles, disputes, finances, and admins';

const seedPermissions = async (): Promise<void> => {
  logger.info(`Seeding ${PERMISSIONS.length} permissions...`);
  let inserted = 0;
  for (const p of PERMISSIONS) {
    const result = await pool.query(
      `INSERT INTO admin_permissions (key, label, category)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE
         SET label = EXCLUDED.label, category = EXCLUDED.category
       RETURNING xmax = 0 AS inserted`,
      [p.key, p.label, p.category],
    );
    if (result.rows[0]?.inserted) inserted++;
  }
  logger.info(`✓ Permissions seeded (${inserted} new, ${PERMISSIONS.length - inserted} updated)`);
};

const ensureSuperAdminRole = async (): Promise<string> => {
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM admin_roles WHERE name = $1`,
    [SUPER_ADMIN_ROLE_NAME],
  );
  if (existing.rows[0]) {
    logger.info(`✓ Super Admin role exists (${existing.rows[0].id})`);
    return existing.rows[0].id;
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO admin_roles (name, description, is_system)
     VALUES ($1, $2, TRUE)
     RETURNING id`,
    [SUPER_ADMIN_ROLE_NAME, SUPER_ADMIN_ROLE_DESCRIPTION],
  );
  logger.info(`✓ Created Super Admin role (${inserted.rows[0].id})`);
  return inserted.rows[0].id;
};

const grantAllPermissionsToRole = async (roleId: string): Promise<void> => {
  const result = await pool.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT $1, id FROM admin_permissions
     ON CONFLICT (role_id, permission_id) DO NOTHING`,
    [roleId],
  );
  logger.info(`✓ Granted ${result.rowCount ?? 0} new permissions to Super Admin`);
};

const ensureBootstrapSuperAdmin = async (roleId: string): Promise<void> => {
  const email = (process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@padlok.com').toLowerCase();
  const name = process.env.SEED_SUPER_ADMIN_NAME ?? 'Super Admin';
  const rawPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const usingDefault = !process.env.SEED_SUPER_ADMIN_PASSWORD;

  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM admins WHERE LOWER(email) = $1`,
    [email],
  );
  if (existing.rows[0]) {
    logger.info(`✓ Bootstrap Super Admin already exists: ${email}`);
    return;
  }

  const hash = await bcrypt.hash(rawPassword, 12);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO admins (name, email, password_hash, role_id, status)
     VALUES ($1, $2, $3, $4, 'active')
     RETURNING id`,
    [name, email, hash, roleId],
  );
  logger.info(`✓ Created bootstrap Super Admin: ${email} (${rows[0].id})`);
  if (usingDefault) {
    logger.warn(
      `⚠  Using DEFAULT password "${rawPassword}". Change it immediately after first login, ` +
        `or set SEED_SUPER_ADMIN_PASSWORD before running seed.`,
    );
  }
};

const run = async (): Promise<void> => {
  logger.info('Running seed...');
  await seedPermissions();
  const roleId = await ensureSuperAdminRole();
  await grantAllPermissionsToRole(roleId);
  await ensureBootstrapSuperAdmin(roleId);
  logger.info('✓ Seed complete');
};

run()
  .catch((err) => {
    logger.error({ err }, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
