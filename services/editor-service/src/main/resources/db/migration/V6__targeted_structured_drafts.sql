CREATE TABLE structured_draft_sources (
  session_id UUID PRIMARY KEY REFERENCES edit_sessions(id),
  source_generation BIGINT NOT NULL,
  settings_revision_id UUID NOT NULL,
  root_revision_ids UUID[] NOT NULL,
  generation BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE structured_draft_operations (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES structured_draft_sources(session_id),
  sequence BIGINT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, sequence)
);
CREATE FUNCTION reject_structured_operation_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Draft operations are immutable'; END;
$$;
CREATE TRIGGER immutable_structured_operations BEFORE UPDATE OR DELETE ON structured_draft_operations
FOR EACH ROW EXECUTE FUNCTION reject_structured_operation_mutation();
