CREATE TABLE import_publication_outbox (
    id UUID PRIMARY KEY,
    import_job_id UUID NOT NULL REFERENCES import_jobs(id),
    event_type VARCHAR(24) NOT NULL CHECK (event_type IN ('audit_publish', 'search_reindex')),
    payload JSONB NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (import_job_id, event_type)
);

CREATE INDEX import_publication_outbox_pending_idx ON import_publication_outbox(available_at, created_at) WHERE delivered_at IS NULL;
