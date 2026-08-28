#!/bin/sh
# Restore all eight service databases from a backup directory produced by backup.sh.
# Usage: restore.sh /backups/YYYYMMDD-HHMMSS
# Run from a host that can reach Compose Postgres hostnames (the backup-service container),
# or: docker compose run --rm backup-service sh /backup/restore.sh /backups/<stamp>
set -eu

SRC_DIR="${1:-}"
if [ -z "$SRC_DIR" ] || [ ! -d "$SRC_DIR" ]; then
  echo "Usage: $0 /backups/<timestamp-dir>" >&2
  exit 1
fi

wait_for_postgres() {
  host="$1"
  db="$2"
  i=0
  until pg_isready -h "$host" -U postgres -d "$db" >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -ge 60 ]; then
      echo "Postgres at ${host}/${db} was not ready after 60s" >&2
      exit 1
    fi
    echo "Waiting for ${host} (${i}/60)..."
    sleep 1
  done
}

for name in catalog content amendment identity editor audit ingestion search; do
  host="${name}-db"
  db="${name}_db"
  dump="${SRC_DIR}/${name}.sql"
  if [ ! -f "$dump" ]; then
    echo "Missing dump $dump" >&2
    exit 1
  fi
  wait_for_postgres "$host" "$db"
  echo "Restoring ${db} from ${dump}..."
  psql -h "$host" -U postgres -d "$db" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
  psql -h "$host" -U postgres -d "$db" -v ON_ERROR_STOP=1 -f "$dump"
done

echo "Restore completed from $SRC_DIR"
