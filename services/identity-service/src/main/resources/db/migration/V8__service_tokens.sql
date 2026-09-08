CREATE TABLE service_tokens (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL,
  created_by UUID NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX service_tokens_active_hash_idx
  ON service_tokens (token_hash)
  WHERE revoked_at IS NULL;
