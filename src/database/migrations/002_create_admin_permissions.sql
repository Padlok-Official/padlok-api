-- UP
-- admin_permissions is a catalog of every capability in the system.
-- Seeded by `npm run migrate:seed` — never inserted from the app at runtime.
-- The `key` is what code checks for (e.g. `requirePermission('resolve_disputes')`);
-- `label` and `category` drive the dashboard's Create Role UI.

CREATE TABLE IF NOT EXISTS admin_permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         VARCHAR(100) UNIQUE NOT NULL,
  label       VARCHAR(200) NOT NULL,
  category    VARCHAR(100) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_permissions_category ON admin_permissions (category);

-- DOWN
DROP TABLE IF EXISTS admin_permissions CASCADE;
