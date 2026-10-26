CREATE TABLE mcp_keys (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users (id),
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX mcp_keys_active_owner_name_idx
  ON mcp_keys (owner_id, name)
  WHERE revoked_at IS NULL;
