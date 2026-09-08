CREATE TABLE outbox_events (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES edit_sessions (id),
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  attempt_count INT NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX outbox_events_unpublished_idx
  ON outbox_events (created_at)
  WHERE published_at IS NULL;

CREATE INDEX outbox_events_session_idx ON outbox_events (session_id);
