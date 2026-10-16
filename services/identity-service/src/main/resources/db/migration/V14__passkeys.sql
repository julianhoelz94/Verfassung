CREATE TABLE passkey_credentials (
  credential_id BYTEA PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  public_key_cose BYTEA NOT NULL,
  signature_count BIGINT NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX passkey_credentials_user_idx ON passkey_credentials (user_id);

CREATE TABLE passkey_challenges (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users (id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('enroll', 'login')),
  request_json TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX passkey_challenges_expires_idx ON passkey_challenges (expires_at);
