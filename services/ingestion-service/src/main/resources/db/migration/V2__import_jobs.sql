CREATE TABLE import_jobs (
  id UUID PRIMARY KEY,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE import_errors (
  id UUID PRIMARY KEY,
  import_job_id UUID NOT NULL REFERENCES import_jobs (id),
  code TEXT NOT NULL,
  message TEXT NOT NULL
);

CREATE TABLE import_staging_records (
  id UUID PRIMARY KEY,
  import_job_id UUID NOT NULL REFERENCES import_jobs (id),
  record_type TEXT NOT NULL,
  payload JSONB NOT NULL
);

CREATE INDEX import_errors_job_idx ON import_errors (import_job_id);
