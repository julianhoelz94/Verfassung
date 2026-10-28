CREATE TABLE source_evidence_revisions (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES edit_sessions(id),
  revision INT NOT NULL CHECK (revision > 0),
  original JSONB,
  evidence JSONB NOT NULL,
  reason TEXT NOT NULL,
  actor_id UUID NOT NULL,
  actor_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, revision)
);

CREATE TABLE source_evidence_decisions (
  id UUID PRIMARY KEY,
  sequence BIGSERIAL UNIQUE,
  revision_id UUID NOT NULL REFERENCES source_evidence_revisions(id),
  action TEXT NOT NULL CHECK (action IN ('review_submitted', 'changes_requested', 'review_approved', 'version_published')),
  actor_id UUID NOT NULL,
  actor_email TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE FUNCTION reject_source_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Source evidence history is immutable'; END;
$$;
CREATE TRIGGER immutable_source_evidence_revisions BEFORE UPDATE OR DELETE ON source_evidence_revisions
FOR EACH ROW EXECUTE FUNCTION reject_source_evidence_mutation();
CREATE TRIGGER immutable_source_evidence_decisions BEFORE UPDATE OR DELETE ON source_evidence_decisions
FOR EACH ROW EXECUTE FUNCTION reject_source_evidence_mutation();
