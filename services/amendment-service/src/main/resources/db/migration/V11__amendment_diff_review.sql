CREATE TABLE amendment_diff_runs (
  revision_id UUID PRIMARY KEY REFERENCES amendment_revisions(id),
  source_version_id UUID NOT NULL,
  target_version_id UUID NOT NULL,
  algorithm_version TEXT NOT NULL,
  candidates JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE amendment_diff_decisions (
  revision_id UUID NOT NULL REFERENCES amendment_diff_runs(revision_id),
  candidate_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'linked', 'excluded_with_reason', 'needs_recheck')),
  linked_change_ids UUID[] NOT NULL DEFAULT '{}',
  exclusion_reason TEXT,
  reviewer_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (revision_id, candidate_key)
);
