CREATE TABLE curated_archive_comparisons (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    request_sha256 TEXT NOT NULL,
    definition JSONB NOT NULL,
    state VARCHAR(20) NOT NULL DEFAULT 'draft',
    reviewed_by UUID,
    review_reason TEXT,
    published_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_id, attempt_id)
);
