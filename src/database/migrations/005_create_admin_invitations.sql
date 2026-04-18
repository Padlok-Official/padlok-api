-- UP
-- admin_invitations holds email invites sent from the dashboard's "Invite User"
-- flow. The invitee receives a signed token link; they set their password and
-- the row transitions from 'pending' → 'accepted' (or 'expired'/'revoked').

CREATE TABLE IF NOT EXISTS admin_invitations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        VARCHAR(255) NOT NULL,
  role_id      UUID NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
  token_hash   VARCHAR(255) UNIQUE NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  invited_by   UUID REFERENCES admins(id) ON DELETE SET NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  accepted_at  TIMESTAMPTZ,
  accepted_as  UUID REFERENCES admins(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one pending invite per email at a time. Partial index lets us allow
-- historical accepted/revoked rows for the same email.
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_invitations_email_pending
  ON admin_invitations (LOWER(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_admin_invitations_status ON admin_invitations (status);
CREATE INDEX IF NOT EXISTS idx_admin_invitations_expires ON admin_invitations (expires_at)
  WHERE status = 'pending';

-- DOWN
DROP TABLE IF EXISTS admin_invitations CASCADE;
