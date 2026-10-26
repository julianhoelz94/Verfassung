ALTER TABLE content_text_revisions
  ADD COLUMN entry_format TEXT NOT NULL DEFAULT 'plain'
    CHECK (entry_format IN ('plain', 'table', 'footnote')),
  ADD COLUMN rich_content JSONB NOT NULL DEFAULT '{}'::jsonb;
