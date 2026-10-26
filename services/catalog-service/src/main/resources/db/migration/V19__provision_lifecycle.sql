CREATE TABLE constitution_provision_events (
  id UUID PRIMARY KEY,
  constitution_id UUID NOT NULL REFERENCES constitutions(id),
  source_version_id UUID NOT NULL REFERENCES constitution_versions(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('deferred', 'commenced', 'suspended', 'restored')),
  event_date DATE NOT NULL,
  logical_unit_ids UUID[] NOT NULL,
  source_url TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  CHECK (array_length(logical_unit_ids, 1) BETWEEN 1 AND 100)
);

CREATE INDEX constitution_provision_events_country_timeline_idx
  ON constitution_provision_events (constitution_id, event_date, created_at);
