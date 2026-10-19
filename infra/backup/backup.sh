#!/bin/sh
set -eu

# Dumps contain password hashes and encrypted MFA secrets: owner-only files.
umask 077

TS="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="/backups/$TS"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
mkdir -p "$OUT_DIR"

. "$(dirname "$0")/postgres.sh"

for name in $BACKUP_DATABASES; do
  host="${name}-db"
  db="${name}_db"
  wait_for_postgres "$host" "$db"
  echo "Dumping ${db} from ${host}..."
  pg_dump -h "$host" -U postgres -d "$db" > "${OUT_DIR}/${name}.sql"
done

echo "Backup completed at $OUT_DIR"

# Rotate: drop timestamped dump directories older than the retention window.
if [ "$RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  find /backups -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} +
  echo "Pruned backups older than ${RETENTION_DAYS} days"
fi
