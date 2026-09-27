-- Durable across rollback of the editor workflow transaction. Session ownership is checked by the service.
CREATE TABLE structured_publish_jobs (
  session_id UUID PRIMARY KEY,
  request_hash TEXT NOT NULL,
  amendment_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
