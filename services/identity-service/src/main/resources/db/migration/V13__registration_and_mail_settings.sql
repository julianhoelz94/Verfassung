CREATE TABLE identity_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  self_registration_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mail_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mail_from TEXT NOT NULL DEFAULT '',
  mail_from_name TEXT NOT NULL DEFAULT 'Constitution Atlas',
  mail_public_base_url TEXT NOT NULL DEFAULT '',
  smtp_host TEXT NOT NULL DEFAULT '',
  smtp_port INTEGER NOT NULL DEFAULT 587 CHECK (smtp_port BETWEEN 1 AND 65535),
  smtp_username TEXT NOT NULL DEFAULT '',
  smtp_password_cipher TEXT,
  smtp_auth BOOLEAN NOT NULL DEFAULT TRUE,
  smtp_starttls BOOLEAN NOT NULL DEFAULT TRUE,
  smtp_ssl BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO identity_settings (id) VALUES (TRUE);

CREATE TABLE registration_verifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX registration_verifications_user_idx ON registration_verifications (user_id);
