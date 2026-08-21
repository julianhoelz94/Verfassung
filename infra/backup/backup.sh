#!/bin/sh
set -eu

TS="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="/backups/$TS"
mkdir -p "$OUT_DIR"

for db in catalog content amendment identity editor audit ingestion; do
  pg_dump -h "${db}-db" -U postgres -d "${db}_db" > "$OUT_DIR/${db}.sql"
done

echo "Backup completed at $OUT_DIR"
