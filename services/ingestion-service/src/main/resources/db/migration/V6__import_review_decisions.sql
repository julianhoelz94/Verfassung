CREATE TABLE import_review_decisions (
    id UUID PRIMARY KEY,
    import_job_id UUID NOT NULL REFERENCES import_jobs(id),
    decision VARCHAR(20) NOT NULL CHECK (decision IN ('approved', 'rejected')),
    reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 2000),
    decided_by UUID NOT NULL,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX import_review_decisions_job_idx ON import_review_decisions(import_job_id, decided_at);

CREATE OR REPLACE FUNCTION reject_import_review_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Import review decisions are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER import_review_decisions_immutable
BEFORE UPDATE OR DELETE ON import_review_decisions
FOR EACH ROW EXECUTE FUNCTION reject_import_review_mutation();
