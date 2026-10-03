CREATE TABLE structured_diff_runs (
  session_id UUID PRIMARY KEY REFERENCES edit_sessions(id),
  source_version_id UUID NOT NULL,
  source_generation BIGINT NOT NULL,
  settings_revision_id UUID NOT NULL,
  draft_generation BIGINT NOT NULL,
  algorithm_version TEXT NOT NULL,
  candidates JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE structured_diff_decisions (
  session_id UUID NOT NULL REFERENCES structured_diff_runs(session_id),
  candidate_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'linked', 'excluded_with_reason', 'needs_recheck')),
  linked_row_ids UUID[] NOT NULL DEFAULT '{}',
  exclusion_reason TEXT,
  reviewer_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (session_id, candidate_key)
);
