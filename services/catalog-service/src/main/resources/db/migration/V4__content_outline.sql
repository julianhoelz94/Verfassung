CREATE TABLE constitution_node_kinds (
  id UUID PRIMARY KEY,
  constitution_id UUID NOT NULL REFERENCES constitutions (id) ON DELETE CASCADE,
  kind_code TEXT NOT NULL,
  display_label TEXT NOT NULL,
  sort_order INT NOT NULL,
  may_hold_text BOOLEAN NOT NULL,
  may_hold_children BOOLEAN NOT NULL,
  UNIQUE (constitution_id, kind_code),
  UNIQUE (constitution_id, sort_order)
);

CREATE TABLE constitution_node_kind_edges (
  constitution_id UUID NOT NULL REFERENCES constitutions (id) ON DELETE CASCADE,
  parent_kind_code TEXT NOT NULL,
  child_kind_code TEXT NOT NULL,
  PRIMARY KEY (constitution_id, parent_kind_code, child_kind_code)
);

-- Default for constitutions created before this migration: a single article kind (flat list).
INSERT INTO constitution_node_kinds (
  id, constitution_id, kind_code, display_label, sort_order, may_hold_text, may_hold_children
)
SELECT gen_random_uuid(), id, 'article', 'Article', 1, TRUE, FALSE
FROM constitutions;

-- Germany Basic Law: article → paragraph → sentence.
DELETE FROM constitution_node_kinds
WHERE constitution_id = '01900000-0000-4000-8000-000000000002';

INSERT INTO constitution_node_kinds (
  id, constitution_id, kind_code, display_label, sort_order, may_hold_text, may_hold_children
) VALUES
  ('01900000-0000-4000-8000-000000000011', '01900000-0000-4000-8000-000000000002', 'article', 'Article', 1, TRUE, TRUE),
  ('01900000-0000-4000-8000-000000000012', '01900000-0000-4000-8000-000000000002', 'paragraph', 'Paragraph', 2, TRUE, TRUE),
  ('01900000-0000-4000-8000-000000000013', '01900000-0000-4000-8000-000000000002', 'sentence', 'Sentence', 3, TRUE, FALSE);

INSERT INTO constitution_node_kind_edges (constitution_id, parent_kind_code, child_kind_code) VALUES
  ('01900000-0000-4000-8000-000000000002', 'article', 'paragraph'),
  ('01900000-0000-4000-8000-000000000002', 'paragraph', 'sentence');
