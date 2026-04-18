-- UP
-- admin_audit_logs captures every consequential action an admin takes:
-- logins, role changes, user bans, dispute resolutions, broadcasts, etc.
-- Supports investigation after incidents and powers the "Recent Activity"
-- feed on the Admin Management screen.

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID REFERENCES admins(id) ON DELETE SET NULL,

  -- Dotted action name, e.g. 'auth.login', 'dispute.resolve', 'user.ban'
  action       VARCHAR(100) NOT NULL,

  -- What was acted upon (nullable for system-wide actions like login)
  entity_type  VARCHAR(50),   -- 'user', 'dispute', 'role', 'admin', etc.
  entity_id    VARCHAR(100),  -- UUID or reference string

  -- Freeform context — before/after state, reason, notes, etc.
  details      JSONB NOT NULL DEFAULT '{}'::jsonb,

  ip_address   INET,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_created
  ON admin_audit_logs (admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action
  ON admin_audit_logs (action);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity
  ON admin_audit_logs (entity_type, entity_id)
  WHERE entity_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
  ON admin_audit_logs (created_at DESC);

-- DOWN
DROP TABLE IF EXISTS admin_audit_logs;
