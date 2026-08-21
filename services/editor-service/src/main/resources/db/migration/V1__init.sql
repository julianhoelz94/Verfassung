CREATE TABLE IF NOT EXISTS service_bootstrap_marker (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note VARCHAR(255) NOT NULL
);

INSERT INTO service_bootstrap_marker (note)
VALUES ('initial migration')
ON CONFLICT DO NOTHING;
