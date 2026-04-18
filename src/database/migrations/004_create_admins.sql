-- UP
-- admins are dashboard users — fully separate from the client-facing `users`
-- table owned by padlokbackend. They authenticate via email + password
-- (optionally with a PIN for sensitive operations like bans).

CREATE TABLE IF NOT EXISTS admins (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               VARCHAR(200) NOT NULL,
  email              VARCHAR(255) UNIQUE NOT NULL,
  phone_number       VARCHAR(30),
  avatar_url         TEXT,
  password_hash      VARCHAR(255) NOT NULL,
  role_id            UUID NOT NULL REFERENCES admin_roles(id) ON DELETE RESTRICT,

  -- Lifecycle
  status             VARCHAR(20) NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'away', 'inactive', 'suspended')),
  invited_by         UUID REFERENCES admins(id) ON DELETE SET NULL,
  last_active_at     TIMESTAMPTZ,
  last_login_at      TIMESTAMPTZ,
  last_login_ip      INET,

  -- Optional PIN for high-stakes actions (ban user, resolve dispute, broadcast)
  pin_hash           VARCHAR(255),
  pin_set_at         TIMESTAMPTZ,
  pin_attempts       INT NOT NULL DEFAULT 0,
  pin_locked_until   TIMESTAMPTZ,

  -- Password reset flow
  password_reset_token      VARCHAR(255),
  password_reset_expires_at TIMESTAMPTZ,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admins_role_id ON admins (role_id);
CREATE INDEX IF NOT EXISTS idx_admins_status ON admins (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_admins_email_lower ON admins (LOWER(email));

-- Now that admins exists, wire up the FK from admin_roles.created_by that
-- we couldn't add in migration 001 (chicken-and-egg).
ALTER TABLE admin_roles
  ADD CONSTRAINT fk_admin_roles_created_by
  FOREIGN KEY (created_by) REFERENCES admins(id) ON DELETE SET NULL;

-- DOWN
ALTER TABLE admin_roles DROP CONSTRAINT IF EXISTS fk_admin_roles_created_by;
DROP TABLE IF EXISTS admins CASCADE;
