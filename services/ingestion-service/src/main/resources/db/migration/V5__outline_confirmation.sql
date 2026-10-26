ALTER TABLE import_jobs ADD COLUMN outline_confirmed_by UUID;
ALTER TABLE import_jobs ADD COLUMN outline_confirmed_at TIMESTAMPTZ;
