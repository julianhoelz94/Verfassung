-- Preserve existing capability flags and record the migration decision for audit.
CREATE TABLE outline_capability_audit (
  constitution_id UUID NOT NULL REFERENCES constitutions(id),
  kind_code TEXT NOT NULL,
  legacy_may_hold_text BOOLEAN NOT NULL,
  legacy_may_hold_children BOOLEAN NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (constitution_id, kind_code)
);
INSERT INTO outline_capability_audit
  (constitution_id, kind_code, legacy_may_hold_text, legacy_may_hold_children)
SELECT constitution_id, kind_code, may_hold_text, may_hold_children FROM constitution_node_kinds;

ALTER TABLE constitution_node_kinds
  ADD COLUMN allow_text_alongside_children BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN title_policy TEXT NOT NULL DEFAULT 'optional' CHECK (title_policy IN ('none', 'optional', 'required')),
  ADD COLUMN label_policy TEXT NOT NULL DEFAULT 'optional' CHECK (label_policy IN ('none', 'optional', 'required')),
  ADD COLUMN label_placement TEXT NOT NULL DEFAULT 'before_title' CHECK (label_placement IN ('before_title', 'after_title', 'inline')),
  ADD COLUMN segmentation TEXT NOT NULL DEFAULT 'plain' CHECK (segmentation IN ('plain', 'sentence'));

-- Existing parent permissions must not be silently revoked. New outlines default off.
UPDATE constitution_node_kinds SET allow_text_alongside_children = TRUE
WHERE may_hold_children AND may_hold_text;
UPDATE constitution_node_kinds SET segmentation = 'sentence'
WHERE kind_code = 'sentence' AND NOT may_hold_children;
