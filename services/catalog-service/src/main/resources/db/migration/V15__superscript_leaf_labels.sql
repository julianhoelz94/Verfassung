ALTER TABLE constitution_node_kinds DROP CONSTRAINT constitution_node_kinds_label_placement_check;
ALTER TABLE constitution_node_kinds ADD CONSTRAINT constitution_node_kinds_label_placement_check CHECK (label_placement IN ('before_title', 'after_title', 'inline', 'superscript'));
