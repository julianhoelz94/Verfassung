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
