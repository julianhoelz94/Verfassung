ALTER TABLE import_uploads ADD COLUMN migration_item_id UUID REFERENCES migration_items(id);
ALTER TABLE import_uploads ADD COLUMN migration_run_id UUID REFERENCES migration_runs(id);
