ALTER TABLE sessions
  ADD COLUMN mfa_verified_at TIMESTAMPTZ,
  ADD COLUMN step_up_at TIMESTAMPTZ;

CREATE TABLE user_mfa (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  totp_secret_cipher TEXT NOT NULL,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mfa_recovery_codes (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX mfa_recovery_user_idx ON mfa_recovery_codes (user_id);

CREATE TABLE mfa_challenges (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL,
  pending_secret_cipher TEXT,
  revoke_token_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX mfa_challenges_expires_idx ON mfa_challenges (expires_at);
