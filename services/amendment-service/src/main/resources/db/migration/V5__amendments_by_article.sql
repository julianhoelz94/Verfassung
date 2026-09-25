-- article_number already exists (V2). This migration stores constitution_id so
-- GET /amendments?constitutionId=&articleNumber= can stay inside amendment-db.
ALTER TABLE version_transitions
  ADD COLUMN constitution_id UUID;

CREATE INDEX version_transitions_constitution_idx ON version_transitions (constitution_id);
