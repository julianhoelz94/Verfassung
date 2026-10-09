CREATE TABLE import_batches (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);

ALTER TABLE import_jobs ADD COLUMN batch_id UUID REFERENCES import_batches (id);
ALTER TABLE import_jobs ADD COLUMN idempotency_key TEXT;
ALTER TABLE import_jobs ADD COLUMN payload_sha256 TEXT;
CREATE UNIQUE INDEX import_jobs_batch_idempotency_idx ON import_jobs (batch_id, idempotency_key) WHERE batch_id IS NOT NULL;
CREATE INDEX import_jobs_batch_idx ON import_jobs (batch_id, created_at);
