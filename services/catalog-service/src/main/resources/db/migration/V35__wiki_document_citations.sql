ALTER TABLE wiki_page_revisions ADD COLUMN citations JSONB NOT NULL DEFAULT '[]'::jsonb;
