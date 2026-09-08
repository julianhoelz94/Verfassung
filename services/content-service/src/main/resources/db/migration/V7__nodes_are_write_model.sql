ALTER TABLE content_nodes
  ADD COLUMN predecessor_id UUID;

CREATE INDEX content_nodes_predecessor_idx
  ON content_nodes (predecessor_id)
  WHERE predecessor_id IS NOT NULL;

DROP TABLE articles;

CREATE VIEW articles AS
SELECT
  id,
  version_id,
  COALESCE(number, label, '') AS article_number,
  COALESCE(title, '') AS title,
  COALESCE(body, '') AS body,
  sort_order,
  created_at
FROM content_nodes
WHERE parent_id IS NULL;
