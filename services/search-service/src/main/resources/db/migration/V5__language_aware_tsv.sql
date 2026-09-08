ALTER TABLE search_documents
  ADD COLUMN language_code VARCHAR(8) NOT NULL DEFAULT 'en';

ALTER TABLE search_documents ALTER COLUMN language_code DROP DEFAULT;

ALTER TABLE search_documents DROP COLUMN tsv;

ALTER TABLE search_documents
  ADD COLUMN tsv tsvector GENERATED ALWAYS AS (
    (
      CASE
        WHEN language_code = 'de' THEN to_tsvector('german', coalesce(title, '') || ' ' || coalesce(body, ''))
        ELSE to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body, ''))
      END
    ) || to_tsvector(
      'simple',
      coalesce(article_number, '') || ' art ' || coalesce(article_number, '')
    )
  ) STORED;

CREATE INDEX search_documents_tsv_idx ON search_documents USING GIN (tsv);
