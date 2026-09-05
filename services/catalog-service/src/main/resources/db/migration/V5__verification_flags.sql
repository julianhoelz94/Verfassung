ALTER TABLE constitution_versions
  ADD COLUMN provenance TEXT NOT NULL DEFAULT 'imported',
  ADD COLUMN verification_state TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN verified_by TEXT,
  ADD COLUMN verified_at TIMESTAMPTZ;

ALTER TABLE constitution_versions
  ADD CONSTRAINT constitution_versions_provenance_chk
    CHECK (provenance IN ('official', 'imported', 'demo')),
  ADD CONSTRAINT constitution_versions_verification_chk
    CHECK (verification_state IN ('unverified', 'verified'));

ALTER TABLE constitution_sources
  ADD COLUMN provenance TEXT NOT NULL DEFAULT 'imported',
  ADD COLUMN verification_state TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN verified_by TEXT,
  ADD COLUMN verified_at TIMESTAMPTZ;

ALTER TABLE constitution_sources
  ADD CONSTRAINT constitution_sources_provenance_chk
    CHECK (provenance IN ('official', 'imported', 'demo')),
  ADD CONSTRAINT constitution_sources_verification_chk
    CHECK (verification_state IN ('unverified', 'verified'));

-- Seed Germany text is local-stack demo data, never claimed as official.
UPDATE constitution_versions
SET provenance = 'demo'
WHERE constitution_id = '01900000-0000-4000-8000-000000000002';

UPDATE constitution_sources
SET provenance = 'demo'
WHERE constitution_version_id IN (
  '01900000-0000-4000-8000-000000000003',
  '01900000-0000-4000-8000-000000000004',
  '01900000-0000-4000-8000-000000000005'
);
