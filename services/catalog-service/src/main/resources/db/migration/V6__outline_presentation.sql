ALTER TABLE constitution_node_kinds
  ADD COLUMN presentation TEXT NOT NULL DEFAULT 'section',
  ADD COLUMN show_label BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN show_title BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN show_kind BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE constitution_node_kinds
  ADD CONSTRAINT constitution_node_kinds_presentation_chk
    CHECK (presentation IN ('section', 'concatenated'));

UPDATE constitution_node_kinds
SET show_title = TRUE, show_kind = TRUE
WHERE kind_code = 'article';

UPDATE constitution_node_kinds
SET presentation = 'concatenated', show_label = FALSE, show_title = FALSE, show_kind = FALSE
WHERE kind_code = 'sentence';
