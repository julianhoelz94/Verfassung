CREATE TABLE change_record_publish_attempts (
  id UUID PRIMARY KEY,
  constitution_id UUID NOT NULL,
  amendment_id UUID NOT NULL REFERENCES amendments(id),
  revision_id UUID NOT NULL REFERENCES amendment_revisions(id),
  request_hash TEXT NOT NULL
);
