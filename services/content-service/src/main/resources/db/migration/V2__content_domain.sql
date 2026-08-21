CREATE TABLE articles (
  id UUID PRIMARY KEY,
  version_id UUID NOT NULL,
  article_number TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (version_id, article_number)
);

CREATE INDEX articles_version_sort_idx ON articles (version_id, sort_order);
