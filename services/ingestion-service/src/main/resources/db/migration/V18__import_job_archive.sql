ALTER TABLE import_jobs ADD COLUMN archived_at TIMESTAMPTZ;
CREATE INDEX import_jobs_owner_archive_idx ON import_jobs (submitted_by, archived_at, created_at DESC);
