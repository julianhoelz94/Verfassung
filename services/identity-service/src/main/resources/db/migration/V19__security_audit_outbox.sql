CREATE TABLE security_audit_outbox (
  id UUID PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  body JSONB NOT NULL,
  delivered_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_error TEXT
);
CREATE INDEX security_audit_outbox_pending_idx ON security_audit_outbox (next_attempt_at, occurred_at)
  WHERE delivered_at IS NULL;
