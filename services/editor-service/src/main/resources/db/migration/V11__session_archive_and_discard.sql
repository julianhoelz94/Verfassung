ALTER TABLE edit_sessions ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE edit_sessions DROP CONSTRAINT edit_sessions_status_check;
ALTER TABLE edit_sessions ADD CONSTRAINT edit_sessions_status_check
  CHECK (status IN ('open', 'reviewing', 'approved', 'published', 'discarded'));
CREATE INDEX edit_sessions_owner_archive_idx ON edit_sessions (actor_id, archived_at, updated_at DESC);
