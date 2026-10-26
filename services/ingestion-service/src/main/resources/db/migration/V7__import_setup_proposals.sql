CREATE TABLE import_setup_proposals (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(24) NOT NULL CHECK (status IN ('proposed', 'confirming', 'confirmed', 'withdrawn')),
    constitution_id UUID,
    settings_revision_id UUID,
    confirmed_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days')
);

CREATE INDEX import_setup_proposals_owner_idx ON import_setup_proposals(owner_id, created_at DESC);
