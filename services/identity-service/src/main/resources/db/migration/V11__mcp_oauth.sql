CREATE TABLE oauth_clients (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  redirect_uris TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE oauth_authorization_codes (
  code_hash TEXT PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES oauth_clients(id),
  owner_id UUID NOT NULL REFERENCES users(id),
  redirect_uri TEXT NOT NULL,
  resource TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);
CREATE INDEX oauth_authorization_codes_expiry_idx ON oauth_authorization_codes(expires_at);

CREATE TABLE oauth_access_tokens (
  token_hash TEXT PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES oauth_clients(id),
  owner_id UUID NOT NULL REFERENCES users(id),
  resource TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX oauth_access_tokens_owner_idx ON oauth_access_tokens(owner_id, created_at DESC);
CREATE INDEX oauth_access_tokens_expiry_idx ON oauth_access_tokens(expires_at);
