CREATE TABLE documents (
    id UUID PRIMARY KEY,
    current_revision INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NOT NULL
);

CREATE TABLE document_revisions (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES documents(id),
    revision INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    source_url TEXT,
    file_name TEXT,
    content_type TEXT,
    file_bytes BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NOT NULL,
    UNIQUE (document_id, revision),
    CHECK (length(btrim(title)) > 0),
    CHECK ((file_name IS NULL AND content_type IS NULL AND file_bytes IS NULL)
        OR (file_name IS NOT NULL AND content_type IS NOT NULL AND file_bytes IS NOT NULL))
);

CREATE INDEX document_revisions_document_id_idx ON document_revisions(document_id, revision DESC);

CREATE TABLE document_events (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES documents(id),
    event_type TEXT NOT NULL,
    actor_id UUID NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revision_id UUID REFERENCES document_revisions(id)
);

CREATE INDEX document_events_document_id_idx ON document_events(document_id, occurred_at DESC);

CREATE TABLE document_link_events (
    id UUID PRIMARY KEY,
    target_type TEXT NOT NULL CHECK (target_type IN ('constitution', 'amendment')),
    target_id UUID NOT NULL,
    document_id UUID NOT NULL REFERENCES documents(id),
    revision_id UUID REFERENCES document_revisions(id),
    action TEXT NOT NULL CHECK (action IN ('attach', 'detach')),
    actor_id UUID NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX document_link_events_target_idx ON document_link_events(target_type, target_id, occurred_at DESC, id DESC);
