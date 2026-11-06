ALTER TABLE documents ADD COLUMN citation_key TEXT;
UPDATE documents SET citation_key = 'doc-' || id::text;
ALTER TABLE documents ALTER COLUMN citation_key SET NOT NULL;
ALTER TABLE document_revisions ADD COLUMN citation_key TEXT;
ALTER TABLE document_revisions ADD COLUMN bibliography JSONB NOT NULL DEFAULT '{}'::jsonb;
UPDATE document_revisions r SET citation_key = d.citation_key FROM documents d WHERE d.id = r.document_id;
ALTER TABLE document_revisions ALTER COLUMN citation_key SET NOT NULL;

-- Retained aliases and active keys share one uniqueness boundary, including archives.
CREATE TABLE document_keys (
    normalized_key TEXT PRIMARY KEY,
    key_value TEXT NOT NULL,
    document_id UUID NOT NULL REFERENCES documents(id),
    CHECK (normalized_key = lower(key_value))
);
INSERT INTO document_keys SELECT lower(citation_key), citation_key, id FROM documents;
CREATE INDEX document_keys_document_idx ON document_keys(document_id);

CREATE TABLE document_tags (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX document_tags_name_idx ON document_tags(lower(name));
CREATE TABLE document_folders (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    tag_id UUID NOT NULL UNIQUE REFERENCES document_tags(id),
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX document_folders_name_idx ON document_folders(lower(name));
CREATE TABLE document_tag_memberships (
    document_id UUID NOT NULL REFERENCES documents(id),
    tag_id UUID NOT NULL REFERENCES document_tags(id),
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(document_id, tag_id)
);
CREATE INDEX document_tag_memberships_tag_idx ON document_tag_memberships(tag_id, document_id);
CREATE INDEX document_revisions_bibliography_idx ON document_revisions USING gin(bibliography);
