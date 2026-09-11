ALTER TABLE constitution_versions
  ADD COLUMN legal_version_id UUID REFERENCES constitution_versions (id),
  ADD COLUMN legal_predecessor_version_id UUID REFERENCES constitution_versions (id),
  ADD COLUMN editorial_predecessor_version_id UUID REFERENCES constitution_versions (id);

ALTER TABLE constitution_versions
  DROP CONSTRAINT constitution_versions_hop_kind_chk;

UPDATE constitution_versions
SET hop_kind = 'legal'
WHERE hop_kind IN ('legal_amendment', 'official_errata');

ALTER TABLE constitution_versions
  ADD CONSTRAINT constitution_versions_hop_kind_chk
    CHECK (hop_kind IN ('initial', 'legal', 'editorial_correction'));

UPDATE constitution_versions
SET legal_version_id = id
WHERE hop_kind IN ('initial', 'legal');

UPDATE constitution_versions
SET legal_predecessor_version_id = predecessor_version_id
WHERE hop_kind = 'legal';

UPDATE constitution_versions e
SET editorial_predecessor_version_id = e.predecessor_version_id,
    legal_version_id = p.legal_version_id
FROM constitution_versions p
WHERE e.hop_kind = 'editorial_correction'
  AND p.id = e.predecessor_version_id;

ALTER TABLE constitution_versions
  ALTER COLUMN legal_version_id SET NOT NULL;

ALTER TABLE constitution_versions
  ADD CONSTRAINT constitution_versions_axis_chk
    CHECK (
      (hop_kind = 'initial'
        AND legal_predecessor_version_id IS NULL
        AND editorial_predecessor_version_id IS NULL
        AND legal_version_id = id)
      OR (hop_kind = 'legal'
        AND legal_predecessor_version_id IS NOT NULL
        AND editorial_predecessor_version_id IS NULL
        AND legal_version_id = id)
      OR (hop_kind = 'editorial_correction'
        AND editorial_predecessor_version_id IS NOT NULL
        AND legal_predecessor_version_id IS NULL)
    );

DROP INDEX constitution_versions_predecessor_version_id_uniq;

CREATE UNIQUE INDEX constitution_versions_legal_predecessor_uniq
  ON constitution_versions (legal_predecessor_version_id)
  WHERE legal_predecessor_version_id IS NOT NULL
    AND publication_status = 'published';

CREATE UNIQUE INDEX constitution_versions_editorial_predecessor_uniq
  ON constitution_versions (legal_version_id, editorial_predecessor_version_id)
  WHERE editorial_predecessor_version_id IS NOT NULL
    AND publication_status = 'published';
