#!/bin/sh
# Restore all service databases from a backup directory produced by backup.sh.
# Usage: restore.sh /backups/YYYYMMDD-HHMMSS
# Run from a host that can reach Compose Postgres hostnames (the backup-service container),
# or: docker compose run --rm backup-service sh /backup/restore.sh /backups/<stamp>
set -eu

SRC_DIR="${1:-}"
if [ -z "$SRC_DIR" ] || [ ! -d "$SRC_DIR" ]; then
  echo "Usage: $0 /backups/<timestamp-dir>" >&2
  exit 1
fi

. "$(dirname "$0")/postgres.sh"

# Validate the complete backup before the first destructive database operation.
for name in $BACKUP_DATABASES; do
  dump="${SRC_DIR}/${name}.sql"
  if [ ! -f "$dump" ] || [ ! -r "$dump" ] || [ ! -s "$dump" ]; then
    echo "Missing, unreadable, or empty dump $dump" >&2
    exit 1
  fi
done

for name in $BACKUP_DATABASES; do
  host="${name}-db"
  db="${name}_db"
  dump="${SRC_DIR}/${name}.sql"
  wait_for_postgres "$host" "$db"
  echo "Restoring ${db} from ${dump}..."
  psql -h "$host" -U postgres -d "$db" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
  psql -h "$host" -U postgres -d "$db" -v ON_ERROR_STOP=1 -f "$dump"
done

echo "Restore completed from $SRC_DIR"
