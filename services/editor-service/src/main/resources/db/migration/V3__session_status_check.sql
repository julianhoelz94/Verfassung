ALTER TABLE edit_sessions
  ADD CONSTRAINT edit_sessions_status_check
  CHECK (status IN ('open', 'reviewing', 'approved', 'published'));
