-- File bytes have one immutable identity. Revision manifests reference that identity
-- so bibliography-only changes no longer duplicate a document's uploaded bytes.
CREATE TABLE document_files (
    id UUID PRIMARY KEY,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    file_bytes BYTEA NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
    sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sha256, file_name, content_type)
);

CREATE TABLE document_revision_attachments (
    revision_id UUID NOT NULL REFERENCES document_revisions(id),
    file_id UUID NOT NULL REFERENCES document_files(id),
    position INTEGER NOT NULL CHECK (position >= 0),
    is_primary BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (revision_id, file_id),
    UNIQUE (revision_id, position)
);

CREATE UNIQUE INDEX document_revision_primary_attachment_idx
    ON document_revision_attachments(revision_id) WHERE is_primary;

-- PostgreSQL's built-in SHA-256 requires no extension. Keep legacy columns as a
-- fallback during rollout and never change historical revision metadata/bytes.
INSERT INTO document_files (id, file_name, content_type, file_bytes, size_bytes, sha256, created_at)
SELECT DISTINCT ON (encode(sha256(file_bytes), 'hex'), file_name, content_type)
       id, file_name, content_type, file_bytes, octet_length(file_bytes),
       encode(sha256(file_bytes), 'hex'), created_at
FROM document_revisions WHERE file_bytes IS NOT NULL
ORDER BY encode(sha256(file_bytes), 'hex'), file_name, content_type, created_at, id;

INSERT INTO document_revision_attachments (revision_id, file_id, position, is_primary)
SELECT r.id, f.id, 0, true
FROM document_revisions r
JOIN document_files f ON f.sha256 = encode(sha256(r.file_bytes), 'hex')
    AND f.file_name = r.file_name AND f.content_type = r.content_type
WHERE r.file_bytes IS NOT NULL;
