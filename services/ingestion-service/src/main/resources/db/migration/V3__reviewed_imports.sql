ALTER TABLE import_jobs ADD COLUMN submitted_by UUID;
ALTER TABLE import_jobs ADD COLUMN prepared_by UUID;
ALTER TABLE import_jobs ADD COLUMN approved_by UUID;
ALTER TABLE import_jobs ADD COLUMN published_by UUID;
ALTER TABLE import_jobs ADD COLUMN approved_at TIMESTAMPTZ;
ALTER TABLE import_jobs ADD COLUMN approved_generation BIGINT;
ALTER TABLE import_jobs ADD COLUMN approved_settings_revision_id UUID;
ALTER TABLE import_jobs ADD COLUMN published_at TIMESTAMPTZ;
CREATE INDEX import_jobs_status_created_idx ON import_jobs (status, created_at DESC);
