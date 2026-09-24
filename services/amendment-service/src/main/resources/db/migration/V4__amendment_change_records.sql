ALTER TABLE amendment_changes
  ADD COLUMN node_id UUID,
  ADD COLUMN changed_on DATE,
  ADD COLUMN effective_on DATE,
  ADD COLUMN amending_law_citation_id UUID;

UPDATE amendment_changes
SET change_type = 'changed'
WHERE change_type IN ('modified', 'updated');

UPDATE amendment_changes
SET node_id = article_id
WHERE node_id IS NULL AND article_id IS NOT NULL;

UPDATE amendment_changes c
SET changed_on = a.enacted_on
FROM amendments a
WHERE a.id = c.amendment_id
  AND c.changed_on IS NULL;

ALTER TABLE amendment_changes
  ADD CONSTRAINT amendment_changes_type_chk
  CHECK (change_type IN ('added', 'changed', 'removed'));
