CREATE TABLE invites (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX invites_user_idx ON invites (user_id);

CREATE TABLE password_resets (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX password_resets_user_idx ON password_resets (user_id);
