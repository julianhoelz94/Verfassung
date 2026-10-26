ALTER TABLE constitution_lifecycle_events
  ADD COLUMN date_certainty TEXT NOT NULL DEFAULT 'exact'
  CHECK (date_certainty IN ('exact', 'approximate'));
