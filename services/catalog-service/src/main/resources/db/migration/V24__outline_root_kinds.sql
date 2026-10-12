ALTER TABLE constitution_node_kinds ADD COLUMN is_root BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE constitution_node_kinds k SET is_root = TRUE
WHERE sort_order = (
  SELECT MIN(first_kind.sort_order)
  FROM constitution_node_kinds first_kind
  WHERE first_kind.constitution_id = k.constitution_id
);
