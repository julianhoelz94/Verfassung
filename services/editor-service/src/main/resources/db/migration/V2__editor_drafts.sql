CREATE TABLE edit_sessions (
  id UUID PRIMARY KEY,
  actor_id UUID NOT NULL,
  version_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE draft_changes (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES edit_sessions (id),
  article_id UUID,
  change_kind TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE edit_revisions (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES edit_sessions (id),
  sequence INT NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, sequence)
);

CREATE INDEX edit_sessions_actor_idx ON edit_sessions (actor_id);
CREATE INDEX draft_changes_session_idx ON draft_changes (session_id);
CREATE INDEX edit_revisions_session_idx ON edit_revisions (session_id);
