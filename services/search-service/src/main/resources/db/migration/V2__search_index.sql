CREATE TABLE search_documents (
  document_id UUID PRIMARY KEY,
  version_id UUID NOT NULL,
  country_code VARCHAR(8) NOT NULL,
  article_number VARCHAR(64) NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'simple',
      coalesce(article_number, '') || ' ' || coalesce(title, '') || ' ' || coalesce(body, '')
    )
  ) STORED
);

CREATE INDEX search_documents_tsv_idx ON search_documents USING GIN (tsv);

CREATE TABLE index_sync_state (
  source VARCHAR(64) PRIMARY KEY,
  last_synced_at TIMESTAMPTZ,
  document_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL
);
