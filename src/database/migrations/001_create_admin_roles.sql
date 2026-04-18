-- UP
-- admin_roles stores both system-defined roles (Super Admin, which cannot be
-- deleted) and custom roles created by Super Admins via the dashboard.
-- Each role has a set of permissions assigned through role_permissions.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS admin_roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(100) UNIQUE NOT NULL,
  description  TEXT,
  is_system    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_roles_is_system ON admin_roles (is_system);

-- DOWN
DROP TABLE IF EXISTS admin_roles CASCADE;
