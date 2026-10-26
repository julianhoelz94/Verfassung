CREATE TABLE wiki_pages (
  id UUID PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('country', 'constitution')),
  target_id UUID NOT NULL,
  published_revision_id UUID,
  UNIQUE (target_type, target_id)
);

CREATE TABLE wiki_page_revisions (
  id UUID PRIMARY KEY,
  page_id UUID NOT NULL REFERENCES wiki_pages(id),
  predecessor_id UUID REFERENCES wiki_page_revisions(id),
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL
);

ALTER TABLE wiki_pages ADD CONSTRAINT wiki_pages_published_revision_fk
  FOREIGN KEY (published_revision_id) REFERENCES wiki_page_revisions(id);

CREATE INDEX wiki_page_revisions_page_idx
  ON wiki_page_revisions (page_id, created_at DESC);
