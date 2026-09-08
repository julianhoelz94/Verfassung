ALTER TABLE service_tokens
  ADD COLUMN expires_at TIMESTAMPTZ;

UPDATE service_tokens
SET expires_at = created_at + INTERVAL '90 days'
WHERE expires_at IS NULL;

ALTER TABLE service_tokens
  ALTER COLUMN expires_at SET NOT NULL;
