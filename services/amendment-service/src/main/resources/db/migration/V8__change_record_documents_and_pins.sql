-- AMD-11 / Sprint 36. Callers: Flyway on amendment-service boot only. Unique: V8 (do not edit V7).
-- Schema: drop amendments.kind; revision comment + documents JSONB; published pins; review_status.
-- User instruction: "Work on Sprint 36"

-- AMD-11: change records are title + comment + documents (no kind enum).
-- Published revisions pin the catalog snapshots they quote; review_status flags stale pins.

ALTER TABLE amendment_revisions
  ADD COLUMN comment TEXT,
  ADD COLUMN documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN reviewed_source_tip_id UUID,
  ADD COLUMN reviewed_target_tip_id UUID,
  ADD COLUMN is_published_tip BOOLEAN NOT NULL DEFAULT false;

UPDATE amendment_revisions
SET comment = summary;

UPDATE amendment_revisions
SET documents = jsonb_build_array(jsonb_build_object('url', source_reference))
WHERE source_reference IS NOT NULL
  AND btrim(source_reference) <> '';

UPDATE amendment_revisions r
SET
  is_published_tip = true,
  reviewed_source_tip_id = COALESCE(r.source_version_id, t.source_version_id),
  reviewed_target_tip_id = COALESCE(r.target_version_id, t.target_version_id)
FROM amendments a
LEFT JOIN version_transitions t ON t.id = a.version_transition_id
WHERE a.published_revision_id = r.id
  AND a.status = 'published';

ALTER TABLE amendment_revisions
  ALTER COLUMN comment SET NOT NULL;

ALTER TABLE amendment_revisions
  DROP COLUMN summary;

ALTER TABLE amendment_revisions
  ADD CONSTRAINT amendment_revisions_documents_array_chk
  CHECK (jsonb_typeof(documents) = 'array');

ALTER TABLE amendments
  ADD COLUMN review_status TEXT NOT NULL DEFAULT 'ok';

ALTER TABLE amendments
  ADD CONSTRAINT amendments_review_status_chk
  CHECK (review_status IN ('ok', 'needs_review'));

ALTER TABLE amendments
  DROP CONSTRAINT amendments_kind_chk;

ALTER TABLE amendments
  DROP COLUMN kind;

-- A snapshot is the source of at most one published change record, and the target of at most one.
CREATE UNIQUE INDEX amendment_revisions_published_source_pin
  ON amendment_revisions (reviewed_source_tip_id)
  WHERE is_published_tip AND reviewed_source_tip_id IS NOT NULL;

CREATE UNIQUE INDEX amendment_revisions_published_target_pin
  ON amendment_revisions (reviewed_target_tip_id)
  WHERE is_published_tip AND reviewed_target_tip_id IS NOT NULL;
