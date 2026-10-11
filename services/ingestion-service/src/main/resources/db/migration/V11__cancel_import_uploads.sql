ALTER TABLE import_uploads DROP CONSTRAINT import_uploads_status_check;
ALTER TABLE import_uploads ADD CONSTRAINT import_uploads_status_check CHECK (status IN ('receiving', 'completed', 'canceled'));
