CREATE TABLE successor_publish_attempts (
  id UUID PRIMARY KEY,
  constitution_id UUID NOT NULL REFERENCES constitutions(id),
  version_id UUID NOT NULL UNIQUE REFERENCES constitution_versions(id),
  request_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
