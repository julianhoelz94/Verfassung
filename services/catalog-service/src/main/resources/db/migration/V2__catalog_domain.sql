CREATE TABLE countries (
  id UUID PRIMARY KEY,
  iso_code VARCHAR(2) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE constitutions (
  id UUID PRIMARY KEY,
  country_id UUID NOT NULL REFERENCES countries (id),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (country_id, slug)
);

CREATE TABLE constitution_versions (
  id UUID PRIMARY KEY,
  constitution_id UUID NOT NULL REFERENCES constitutions (id),
  version_label TEXT NOT NULL,
  effective_date DATE,
  publication_status TEXT NOT NULL DEFAULT 'published',
  language_code VARCHAR(16) NOT NULL DEFAULT 'en',
  source_url TEXT,
  gazette_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (constitution_id, version_label)
);

CREATE TABLE constitution_sources (
  id UUID PRIMARY KEY,
  constitution_version_id UUID NOT NULL REFERENCES constitution_versions (id),
  source_url TEXT,
  gazette_reference TEXT,
  archival_reference TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX constitution_versions_constitution_id_idx
  ON constitution_versions (constitution_id);
