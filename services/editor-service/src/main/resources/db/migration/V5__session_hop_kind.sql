ALTER TABLE edit_sessions ADD COLUMN hop_kind TEXT;
ALTER TABLE edit_sessions ADD COLUMN publish_comment TEXT;
ALTER TABLE edit_sessions ADD COLUMN change_record JSONB;
ALTER TABLE edit_sessions ADD CONSTRAINT edit_sessions_hop_kind_check
  CHECK (hop_kind IN ('legal', 'editorial_correction'));
