CREATE TABLE constitution_lifecycle_events (
  id UUID PRIMARY KEY,
  constitution_id UUID NOT NULL REFERENCES constitutions(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('adopted', 'commenced', 'suspended', 'restored', 'repealed')),
  event_date DATE NOT NULL,
  source_url TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  UNIQUE (constitution_id, event_date)
);

CREATE INDEX constitution_lifecycle_events_order_idx
  ON constitution_lifecycle_events (constitution_id, event_date, created_at);

ALTER TABLE constitutions
  ADD COLUMN predecessor_constitution_id UUID REFERENCES constitutions(id),
  ADD COLUMN interim BOOLEAN NOT NULL DEFAULT FALSE;
