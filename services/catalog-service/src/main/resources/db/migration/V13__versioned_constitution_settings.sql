CREATE TABLE constitution_settings_revisions (
  id UUID PRIMARY KEY,
  constitution_id UUID NOT NULL REFERENCES constitutions(id),
  predecessor_id UUID REFERENCES constitution_settings_revisions(id),
  outline JSONB NOT NULL CHECK (jsonb_typeof(outline) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (constitution_id, id)
);
ALTER TABLE constitutions ADD COLUMN settings_revision_id UUID;
ALTER TABLE constitution_versions ADD COLUMN structural_settings_revision_id UUID;

INSERT INTO constitution_settings_revisions(id, constitution_id, outline)
SELECT gen_random_uuid(), c.id, jsonb_build_object('kinds', COALESCE((
  SELECT jsonb_agg(jsonb_build_object(
    'kindCode', k.kind_code, 'displayLabel', k.display_label, 'sortOrder', k.sort_order,
    'mayHoldText', k.may_hold_text, 'mayHoldChildren', k.may_hold_children,
    'allowedChildKinds', COALESCE((SELECT jsonb_agg(e.child_kind_code ORDER BY e.child_kind_code)
      FROM constitution_node_kind_edges e WHERE e.constitution_id = c.id AND e.parent_kind_code = k.kind_code), '[]'::jsonb),
    'presentation', k.presentation, 'showLabel', k.show_label, 'showTitle', k.show_title,
    'showKind', k.show_kind, 'allowTextAlongsideChildren', k.allow_text_alongside_children,
    'titlePolicy', k.title_policy, 'labelPolicy', k.label_policy,
    'labelPlacement', k.label_placement, 'segmentation', k.segmentation
  ) ORDER BY k.sort_order) FROM constitution_node_kinds k WHERE k.constitution_id = c.id
), '[]'::jsonb)) FROM constitutions c;

UPDATE constitutions c SET settings_revision_id = r.id
FROM constitution_settings_revisions r WHERE r.constitution_id = c.id;
UPDATE constitution_versions v SET structural_settings_revision_id = c.settings_revision_id
FROM constitutions c WHERE c.id = v.constitution_id;
ALTER TABLE constitutions ADD FOREIGN KEY (id, settings_revision_id)
  REFERENCES constitution_settings_revisions(constitution_id, id);
ALTER TABLE constitution_versions ADD FOREIGN KEY (constitution_id, structural_settings_revision_id)
  REFERENCES constitution_settings_revisions(constitution_id, id);

-- Revision bytes cannot be changed, including during presentation reverts.
CREATE FUNCTION reject_settings_revision_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Settings revisions are immutable'; END;
$$;
CREATE TRIGGER settings_revision_immutable BEFORE UPDATE OR DELETE ON constitution_settings_revisions
FOR EACH ROW EXECUTE FUNCTION reject_settings_revision_update();
