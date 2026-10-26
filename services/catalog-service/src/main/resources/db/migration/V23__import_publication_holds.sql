CREATE TABLE import_publication_holds (
  version_id UUID PRIMARY KEY REFERENCES constitution_versions (id),
  import_job_id UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
