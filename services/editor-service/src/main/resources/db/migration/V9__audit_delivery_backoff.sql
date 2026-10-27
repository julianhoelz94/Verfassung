ALTER TABLE outbox_events ADD COLUMN next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp();
CREATE INDEX outbox_audit_due_idx ON outbox_events (next_attempt_at, created_at)
  WHERE published_at IS NULL AND event_name = 'audit.append-requested';
