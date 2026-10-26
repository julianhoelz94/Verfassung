CREATE TABLE import_uploads (
    id UUID PRIMARY KEY,
    batch_id UUID NOT NULL REFERENCES import_batches(id),
    owner_id UUID NOT NULL,
    idempotency_key TEXT NOT NULL,
    checksum_sha256 CHAR(64) NOT NULL,
    total_bytes INT NOT NULL CHECK (total_bytes BETWEEN 1 AND 26214400),
    status VARCHAR(20) NOT NULL DEFAULT 'receiving' CHECK (status IN ('receiving', 'completed')),
    import_job_id UUID REFERENCES import_jobs(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    UNIQUE (batch_id, idempotency_key)
);

CREATE TABLE import_upload_chunks (
    upload_id UUID NOT NULL REFERENCES import_uploads(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    bytes BYTEA NOT NULL,
    checksum_sha256 CHAR(64) NOT NULL,
    PRIMARY KEY (upload_id, chunk_index)
);

CREATE INDEX import_uploads_expiry_idx ON import_uploads(expires_at);
