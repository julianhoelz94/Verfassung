CREATE TABLE legacy_archive_mappings (
    id UUID PRIMARY KEY,
    source_key TEXT NOT NULL UNIQUE,
    source_url TEXT NOT NULL,
    target JSONB NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
