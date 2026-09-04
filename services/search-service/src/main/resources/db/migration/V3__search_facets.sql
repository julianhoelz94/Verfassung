ALTER TABLE search_documents
  ADD COLUMN constitution_title TEXT NOT NULL DEFAULT '',
  ADD COLUMN version_label TEXT NOT NULL DEFAULT '',
  ADD COLUMN effective_date DATE;

ALTER TABLE search_documents ALTER COLUMN constitution_title DROP DEFAULT;
ALTER TABLE search_documents ALTER COLUMN version_label DROP DEFAULT;

CREATE INDEX search_documents_country_idx ON search_documents (country_code);
CREATE INDEX search_documents_version_idx ON search_documents (version_id);
CREATE INDEX search_documents_effective_date_idx ON search_documents (effective_date);
