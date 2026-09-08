ALTER TABLE search_documents
  ADD COLUMN country_name TEXT NOT NULL DEFAULT '';

ALTER TABLE search_documents ALTER COLUMN country_name DROP DEFAULT;
