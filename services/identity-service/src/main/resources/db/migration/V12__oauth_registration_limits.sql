CREATE TABLE oauth_registration_limits (
  ip_hash TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  registrations INTEGER NOT NULL DEFAULT 0
);
