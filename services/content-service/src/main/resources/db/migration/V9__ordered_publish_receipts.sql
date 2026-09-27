CREATE TABLE ordered_publish_receipts (
  attempt_id UUID PRIMARY KEY,
  version_id UUID NOT NULL UNIQUE REFERENCES content_snapshots(version_id),
  request_hash TEXT NOT NULL,
  generation BIGINT NOT NULL
);
