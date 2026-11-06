CREATE TABLE lifecycle_evidence_revisions (
    id UUID PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES constitution_lifecycle_events(id),
    predecessor_id UUID REFERENCES lifecycle_evidence_revisions(id),
    note TEXT,
    source_url TEXT,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lifecycle_evidence_revisions_event_idx ON lifecycle_evidence_revisions(event_id, created_at DESC, id DESC);
