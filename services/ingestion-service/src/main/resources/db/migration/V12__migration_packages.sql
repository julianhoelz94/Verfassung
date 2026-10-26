CREATE TABLE migration_runs (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL,
    run_key VARCHAR(200) NOT NULL,
    manifest JSONB NOT NULL,
    manifest_sha256 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_id, run_key)
);
CREATE TABLE migration_items (
    id UUID PRIMARY KEY,
    run_id UUID NOT NULL REFERENCES migration_runs(id),
    source_key VARCHAR(200) NOT NULL,
    kind VARCHAR(32) NOT NULL,
    request_sha256 TEXT NOT NULL,
    payload JSONB NOT NULL,
    dependencies JSONB NOT NULL,
    state VARCHAR(32) NOT NULL DEFAULT 'staged',
    result JSONB NOT NULL DEFAULT '{}',
    attempts INT NOT NULL DEFAULT 0,
    error TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (run_id, source_key)
);
CREATE INDEX migration_runs_owner_idx ON migration_runs(owner_id, created_at DESC);
