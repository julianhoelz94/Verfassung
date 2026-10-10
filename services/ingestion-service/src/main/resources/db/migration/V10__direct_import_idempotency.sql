CREATE UNIQUE INDEX import_jobs_direct_idempotency_idx
  ON import_jobs (submitted_by, idempotency_key)
  WHERE batch_id IS NULL AND idempotency_key IS NOT NULL;
