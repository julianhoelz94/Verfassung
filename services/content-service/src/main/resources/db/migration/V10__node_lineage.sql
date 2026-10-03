ALTER TABLE content_node_revisions ADD COLUMN lineage UUID[] NOT NULL DEFAULT '{}';
