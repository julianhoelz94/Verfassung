-- Numbered paragraphs are not a titled table-of-contents layer.
UPDATE constitution_node_kinds
SET show_title = FALSE
WHERE kind_code = 'paragraph';
