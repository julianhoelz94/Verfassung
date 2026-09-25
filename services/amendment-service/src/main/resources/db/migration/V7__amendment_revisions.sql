-- AMD-7: stable amendment identity + linear revision chain.

-- (1) Extend amendments (published_revision_id FK added after revisions exist).
ALTER TABLE amendments
  ADD COLUMN constitution_id UUID,
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'legal_amendment',
  ADD COLUMN status TEXT NOT NULL DEFAULT 'published',
  ADD COLUMN published_revision_id UUID;

ALTER TABLE amendments
  ADD CONSTRAINT amendments_kind_chk
  CHECK (kind IN ('legal_amendment', 'official_errata'));

ALTER TABLE amendments
  ADD CONSTRAINT amendments_status_chk
  CHECK (status IN ('draft', 'published', 'withdrawn'));

UPDATE amendments a
SET constitution_id = t.constitution_id
FROM version_transitions t
WHERE t.id = a.version_transition_id;

ALTER TABLE amendments
  ALTER COLUMN constitution_id SET NOT NULL;

ALTER TABLE amendments
  ALTER COLUMN version_transition_id DROP NOT NULL;

-- (2) Revision chain (one first revision per amendment via partial unique index).
CREATE TABLE amendment_revisions (
  id UUID PRIMARY KEY,
  amendment_id UUID NOT NULL REFERENCES amendments (id),
  predecessor_revision_id UUID UNIQUE REFERENCES amendment_revisions (id),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  enacted_on DATE,
  effective_on DATE,
  source_reference TEXT,
  source_version_id UUID,
  target_version_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX amendment_revisions_first_revision_idx
  ON amendment_revisions (amendment_id)
  WHERE predecessor_revision_id IS NULL;

CREATE INDEX amendment_revisions_amendment_idx ON amendment_revisions (amendment_id);

-- (4) Point change rows at the published revision, then drop amendment_id.
ALTER TABLE amendment_changes
  ADD COLUMN revision_id UUID;

UPDATE amendment_changes c
SET revision_id = a.published_revision_id
FROM amendments a
WHERE a.id = c.amendment_id;

ALTER TABLE amendment_changes
  ALTER COLUMN revision_id SET NOT NULL;

ALTER TABLE amendment_changes
  ADD CONSTRAINT amendment_changes_revision_fk
  FOREIGN KEY (revision_id) REFERENCES amendment_revisions (id);

ALTER TABLE amendment_changes
  DROP COLUMN amendment_id;

CREATE INDEX amendment_changes_revision_idx ON amendment_changes (revision_id);

-- (5) published_revision_id must reference a revision of this amendment.
ALTER TABLE amendments
  ADD CONSTRAINT amendments_published_revision_fk
  FOREIGN KEY (published_revision_id) REFERENCES amendment_revisions (id);

CREATE OR REPLACE FUNCTION check_published_revision_belongs_to_amendment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.published_revision_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM amendment_revisions r
      WHERE r.id = NEW.published_revision_id
        AND r.amendment_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'published_revision_id must belong to this amendment';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER amendments_published_revision_check
  AFTER INSERT OR UPDATE OF published_revision_id ON amendments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION check_published_revision_belongs_to_amendment();
