ALTER TABLE amendment_changes ADD COLUMN source_change_id UUID;
CREATE INDEX amendment_changes_source_change_idx ON amendment_changes(source_change_id) WHERE source_change_id IS NOT NULL;
