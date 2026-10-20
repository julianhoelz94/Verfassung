ALTER TABLE jurisdictions
  ADD COLUMN historical BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN existed_from DATE,
  ADD COLUMN existed_until DATE,
  ADD CONSTRAINT jurisdiction_existence_dates CHECK (existed_from IS NULL OR existed_until IS NULL OR existed_from <= existed_until),
  ADD CONSTRAINT jurisdiction_historical_end CHECK (existed_until IS NULL OR historical);

DROP INDEX jurisdictions_parent_code_key;
CREATE UNIQUE INDEX jurisdictions_current_parent_code_key
  ON jurisdictions (parent_id, code) NULLS NOT DISTINCT WHERE code IS NOT NULL AND NOT historical;
