-- AMD-12 / Sprint 44. Keep legacy node_id rows readable; only constrain rows
-- that opt into version-pinned exact unit references.
ALTER TABLE amendment_changes
  ADD COLUMN link_review_reason TEXT,
  ADD COLUMN legacy_link_unresolved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN draft_after_logical_id UUID,
  ADD COLUMN before_version_id UUID,
  ADD COLUMN before_logical_id UUID,
  ADD COLUMN before_occurrence_id UUID,
  ADD COLUMN before_root_occurrence_id UUID,
  ADD COLUMN before_revision_id UUID,
  ADD COLUMN before_unit_kind TEXT,
  ADD COLUMN after_version_id UUID,
  ADD COLUMN after_logical_id UUID,
  ADD COLUMN after_occurrence_id UUID,
  ADD COLUMN after_root_occurrence_id UUID,
  ADD COLUMN after_revision_id UUID,
  ADD COLUMN after_unit_kind TEXT;

UPDATE amendment_changes
SET legacy_link_unresolved = TRUE
WHERE node_id IS NOT NULL;

ALTER TABLE amendment_changes
  ADD CONSTRAINT amendment_changes_before_ref_shape_chk CHECK (
    (before_version_id IS NULL AND before_logical_id IS NULL AND before_occurrence_id IS NULL AND before_root_occurrence_id IS NULL AND before_revision_id IS NULL AND before_unit_kind IS NULL)
    OR (before_version_id IS NOT NULL AND before_logical_id IS NOT NULL AND before_occurrence_id IS NOT NULL AND before_root_occurrence_id IS NOT NULL AND before_revision_id IS NOT NULL AND before_unit_kind IN ('node', 'text_entry'))
  ),
  ADD CONSTRAINT amendment_changes_after_ref_shape_chk CHECK (
    (after_version_id IS NULL AND after_logical_id IS NULL AND after_occurrence_id IS NULL AND after_root_occurrence_id IS NULL AND after_revision_id IS NULL AND after_unit_kind IS NULL AND draft_after_logical_id IS NULL)
    OR (after_version_id IS NOT NULL AND after_logical_id IS NOT NULL AND after_occurrence_id IS NOT NULL AND after_root_occurrence_id IS NOT NULL AND after_revision_id IS NOT NULL AND after_unit_kind IN ('node', 'text_entry'))
    OR (draft_after_logical_id IS NOT NULL AND after_version_id IS NULL AND after_logical_id IS NULL AND after_occurrence_id IS NULL AND after_root_occurrence_id IS NULL AND after_revision_id IS NULL AND after_unit_kind IS NULL)
  ),
  ADD CONSTRAINT amendment_changes_draft_after_ref_chk CHECK (
    draft_after_logical_id IS NULL OR (after_version_id IS NULL AND after_logical_id IS NULL AND after_occurrence_id IS NULL AND after_root_occurrence_id IS NULL AND after_revision_id IS NULL AND after_unit_kind IS NULL)
  ),
  ADD CONSTRAINT amendment_changes_exact_sides_chk CHECK (
    (before_logical_id IS NULL AND after_logical_id IS NULL AND draft_after_logical_id IS NULL)
    OR (change_type = 'changed' AND before_logical_id IS NOT NULL AND (after_logical_id IS NOT NULL OR draft_after_logical_id IS NOT NULL))
    OR (change_type = 'added' AND before_logical_id IS NULL AND (after_logical_id IS NOT NULL OR draft_after_logical_id IS NOT NULL))
    OR (change_type = 'removed' AND before_logical_id IS NOT NULL AND after_logical_id IS NULL AND draft_after_logical_id IS NULL)
  );

CREATE INDEX amendment_changes_before_ref_idx
  ON amendment_changes (before_occurrence_id) WHERE before_occurrence_id IS NOT NULL;
CREATE INDEX amendment_changes_after_ref_idx
  ON amendment_changes (after_occurrence_id) WHERE after_occurrence_id IS NOT NULL;
