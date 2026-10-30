ALTER TABLE wiki_pages DROP CONSTRAINT wiki_pages_target_type_check;
ALTER TABLE wiki_pages ADD CONSTRAINT wiki_pages_target_type_check
  CHECK (target_type IN ('country', 'constitution', 'jurisdiction'));
