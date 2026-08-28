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

-- Opaque citation-service id (no FK). One seed amending law for the demo transition.
UPDATE amendment_changes
SET amending_law_citation_id = '01900000-0000-4000-8000-000000000380'
WHERE amendment_id = '01900000-0000-4000-8000-000000000302';

-- Sub-article target: the added human-rights sentence on 2022 Article 1.
INSERT INTO amendment_changes (
  id, amendment_id, article_id, article_number, change_type, note,
  node_id, changed_on, effective_on, amending_law_citation_id
) VALUES (
  '01900000-0000-4000-8000-000000000315',
  '01900000-0000-4000-8000-000000000302',
  '01900000-0000-4000-8000-000000000201',
  '1',
  'added',
  'Human-rights sentence added as a new paragraph.',
  '01900000-0000-4000-8000-000000000225',
  DATE '2022-12-19',
  NULL,
  '01900000-0000-4000-8000-000000000380'
);
