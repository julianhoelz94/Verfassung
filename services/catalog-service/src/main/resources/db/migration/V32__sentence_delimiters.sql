ALTER TABLE constitution_node_kinds
    ADD COLUMN sentence_delimiters TEXT[] NOT NULL DEFAULT ARRAY['.', '!', '?']::TEXT[];
