ALTER TABLE sessions
  ADD COLUMN last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX sessions_last_seen_idx ON sessions (last_seen_at);

CREATE TABLE login_throttle (
  throttle_key TEXT PRIMARY KEY,
  failure_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
