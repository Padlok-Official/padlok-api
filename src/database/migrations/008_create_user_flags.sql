-- UP
-- user_flags — admin-applied flags on `users` rows in the shared Postgres.
-- Keyed by the user UUID from padlokbackend's users table. We do NOT
-- declare a foreign key here because the users table is owned by the
-- client backend and may be migrated/renamed independently. Orphan rows
-- are caught by the `resolved_at` filter + cleanup worker.

CREATE TYPE user_flag_severity AS ENUM ('critical', 'warning', 'info');

CREATE TABLE IF NOT EXISTS user_flags (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL,
  flagged_by       UUID NOT NULL REFERENCES admins(id),
  reason           TEXT NOT NULL,
  severity         user_flag_severity NOT NULL DEFAULT 'warning',
  category         VARCHAR(100), -- e.g. 'fraud', 'policy', 'abuse'
  related_dispute_id UUID,
  related_transaction_id UUID,
  notes            TEXT,
  resolved_at      TIMESTAMPTZ,
  resolved_by      UUID REFERENCES admins(id),
  resolution_notes TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_flags_user_id ON user_flags (user_id);
CREATE INDEX IF NOT EXISTS idx_user_flags_severity ON user_flags (severity) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_flags_created_at ON user_flags (created_at DESC);

-- risk_alerts — derived, high-signal events for the Flags & Reports page's
-- "Recent Risk Alerts" panel. Emitted by the app (disputes worker, fraud
-- heuristics, future ML scorer) rather than by admins directly.

CREATE TABLE IF NOT EXISTS risk_alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  title       VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  severity    user_flag_severity NOT NULL DEFAULT 'warning',
  source      VARCHAR(100) NOT NULL, -- 'dispute', 'heuristic', 'manual', ...
  metadata    JSONB DEFAULT '{}'::jsonb,
  acknowledged_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_alerts_user_id ON risk_alerts (user_id);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_created_at ON risk_alerts (created_at DESC);

-- DOWN
DROP TABLE IF EXISTS risk_alerts CASCADE;
DROP TABLE IF EXISTS user_flags CASCADE;
DROP TYPE IF EXISTS user_flag_severity;
