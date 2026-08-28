CREATE TABLE content_nodes (
  id UUID PRIMARY KEY,
  version_id UUID NOT NULL,
  kind TEXT NOT NULL,
  parent_id UUID REFERENCES content_nodes (id) ON DELETE CASCADE,
  label TEXT,
  number TEXT,
  title TEXT,
  body TEXT,
  sort_order INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX content_nodes_version_parent_idx
  ON content_nodes (version_id, parent_id, sort_order);

INSERT INTO content_nodes (id, version_id, kind, parent_id, label, number, title, body, sort_order, created_at)
SELECT id, version_id, 'article', NULL, article_number, article_number, title, body, sort_order, created_at
FROM articles;
