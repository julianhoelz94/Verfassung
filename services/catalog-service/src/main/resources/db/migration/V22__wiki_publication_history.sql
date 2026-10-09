ALTER TABLE wiki_page_revisions
  ADD COLUMN published_at TIMESTAMPTZ;

UPDATE wiki_page_revisions r
SET published_at = r.created_at
FROM wiki_pages p
WHERE p.published_revision_id = r.id;

CREATE INDEX wiki_page_revisions_published_idx
  ON wiki_page_revisions (page_id, published_at DESC)
  WHERE published_at IS NOT NULL;
