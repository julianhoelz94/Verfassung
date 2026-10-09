ALTER TABLE wiki_page_revisions
  ADD COLUMN source_urls JSONB NOT NULL DEFAULT '[]'::jsonb;
