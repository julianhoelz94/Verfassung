CREATE TABLE migration_capture_attempts (
    owner_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    request_sha256 TEXT NOT NULL,
    document_id UUID NOT NULL REFERENCES documents(id),
    revision_number INT NOT NULL,
    PRIMARY KEY (owner_id, attempt_id)
);
