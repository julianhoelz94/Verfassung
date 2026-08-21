CREATE TABLE version_transitions (
  id UUID PRIMARY KEY,
  source_version_id UUID NOT NULL,
  target_version_id UUID NOT NULL,
  UNIQUE (source_version_id, target_version_id)
);

CREATE TABLE amendments (
  id UUID PRIMARY KEY,
  version_transition_id UUID NOT NULL REFERENCES version_transitions (id),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  enacted_on DATE,
  source_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE amendment_changes (
  id UUID PRIMARY KEY,
  amendment_id UUID NOT NULL REFERENCES amendments (id),
  article_id UUID,
  article_number TEXT,
  change_type TEXT NOT NULL,
  note TEXT
);

CREATE INDEX amendments_transition_idx ON amendments (version_transition_id);
CREATE INDEX version_transitions_target_idx ON version_transitions (target_version_id);
