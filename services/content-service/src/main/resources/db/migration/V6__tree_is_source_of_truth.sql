-- Parent nodes with children must not store a second copy of the text.
-- Display and derived article.body come from descendant nodes only.
UPDATE content_nodes AS parent
SET body = NULL
WHERE parent.body IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM content_nodes child WHERE child.parent_id = parent.id
  );
