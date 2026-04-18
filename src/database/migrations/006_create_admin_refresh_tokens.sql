-- UP
-- admin_refresh_tokens lets us revoke long-lived refresh tokens on logout,
-- password change, or forced session invalidation. The raw token goes to
-- the client; we store only a bcrypt hash and check on refresh.

CREATE TABLE IF NOT EXISTS admin_refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,
  user_agent  TEXT,
  ip_address  INET,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_refresh_tokens_admin
  ON admin_refresh_tokens (admin_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_admin_refresh_tokens_expires
  ON admin_refresh_tokens (expires_at)
  WHERE revoked_at IS NULL;

-- DOWN
DROP TABLE IF EXISTS admin_refresh_tokens;
