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

if [ -e "$SRC_DIR/INCOMPLETE" ]; then
  echo "Backup is incomplete or still running: $SRC_DIR" >&2
  exit 1
fi

# Validate the complete backup before the first destructive database operation.
for name in $BACKUP_DATABASES; do
  dump="${SRC_DIR}/${name}.sql"
  if [ ! -f "$dump" ] || [ ! -r "$dump" ] || [ ! -s "$dump" ]; then
    echo "Missing, unreadable, or empty dump $dump" >&2
    exit 1
  fi
done

# Verify only the expected filenames; never let a supplied checksum manifest
# choose paths outside the backup directory. Legacy dumps remain explicitly
# distinguishable from new integrity-checked backups.
if [ -e "$SRC_DIR/SHA256SUMS" ] || [ -e "$SRC_DIR/backup.meta" ]; then
  if [ ! -f "$SRC_DIR/SHA256SUMS" ] || [ ! -f "$SRC_DIR/backup.meta" ] ||
     ! grep -qx 'format=1' "$SRC_DIR/backup.meta"; then
    echo "Missing or unsupported backup manifest" >&2
    exit 1
  fi
  manifest_lines="$(wc -l < "$SRC_DIR/SHA256SUMS" | tr -d ' ')"
  if [ "$manifest_lines" != 9 ]; then
    echo "Checksum manifest must contain all nine database dumps" >&2
    exit 1
  fi
  for name in $BACKUP_DATABASES; do
    dump="${SRC_DIR}/${name}.sql"
    expected="$(awk -v file="${name}.sql" '$2 == file { print $1 }' "$SRC_DIR/SHA256SUMS")"
    actual="$(sha256sum "$dump" | cut -d ' ' -f 1)"
    if [ -L "$dump" ] || [ "$expected" != "$actual" ]; then
      echo "Backup checksum mismatch: ${name}.sql" >&2
      exit 1
    fi
  done
else
  echo "Legacy backup: no integrity manifest; restore cannot verify dump checksums" >&2
fi

for name in $BACKUP_DATABASES; do
  host="${name}-db"
  db="${name}_db"
  dump="${SRC_DIR}/${name}.sql"
  wait_for_postgres "$host" "$db"
  echo "Restoring ${db} from ${dump}..."
  if [ "$name" = audit ]; then
    # SQL dumps include grants but not cluster roles. A fresh host needs the
    # restricted role before replaying grants. App startup configures its password
    # using the separately retained owner/runtime credentials; never store it here.
    psql -h "$host" -U postgres -d "$db" -v ON_ERROR_STOP=1 -c 'DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '\''audit_runtime'\'') THEN CREATE ROLE audit_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END $$;'
  fi
  psql -h "$host" -U postgres -d "$db" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
  psql -h "$host" -U postgres -d "$db" -v ON_ERROR_STOP=1 -f "$dump"
done

echo "Restore completed from $SRC_DIR"
