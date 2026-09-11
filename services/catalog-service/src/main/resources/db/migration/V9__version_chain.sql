ALTER TABLE constitution_versions
  ADD COLUMN predecessor_version_id UUID REFERENCES constitution_versions (id),
  ADD COLUMN hop_kind TEXT NOT NULL DEFAULT 'initial',
  ADD COLUMN listing TEXT NOT NULL DEFAULT 'public';

ALTER TABLE constitution_versions
  ADD CONSTRAINT constitution_versions_hop_kind_chk
    CHECK (hop_kind IN ('initial', 'legal_amendment', 'official_errata', 'editorial_correction')),
  ADD CONSTRAINT constitution_versions_listing_chk
    CHECK (listing IN ('public', 'staff')),
  ADD CONSTRAINT constitution_versions_editorial_listing_chk
    CHECK ((hop_kind = 'editorial_correction') = (listing = 'staff'));

CREATE UNIQUE INDEX constitution_versions_predecessor_version_id_uniq
  ON constitution_versions (predecessor_version_id);

UPDATE constitution_versions
SET hop_kind = 'initial', listing = 'public', predecessor_version_id = NULL
WHERE id = '01900000-0000-4000-8000-000000000003';

UPDATE constitution_versions
SET hop_kind = 'legal_amendment', listing = 'public',
    predecessor_version_id = '01900000-0000-4000-8000-000000000003'
WHERE id = '01900000-0000-4000-8000-000000000004';
