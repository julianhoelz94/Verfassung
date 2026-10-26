ALTER TABLE search_documents ADD COLUMN jurisdiction_id UUID;
ALTER TABLE search_documents ADD COLUMN jurisdiction_name TEXT;
ALTER TABLE search_documents ADD COLUMN historical BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX search_documents_jurisdiction_idx ON search_documents (jurisdiction_id);
