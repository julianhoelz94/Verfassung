CREATE TABLE constitution_creation_receipts (
    id UUID PRIMARY KEY,
    jurisdiction_id UUID NOT NULL REFERENCES jurisdictions(id),
    constitution_id UUID NOT NULL REFERENCES constitutions(id),
    request_hash TEXT NOT NULL,
    response JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
