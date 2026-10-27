#!/bin/sh
set -eu

# Dumps contain password hashes and encrypted MFA secrets: owner-only files.
umask 077

TS="$(date -u +%Y%m%d-%H%M%S)"
BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
OUT_DIR="${BACKUP_ROOT}/$TS"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
WRITER_POLICY="${BACKUP_WRITER_POLICY:-online}"
case "$WRITER_POLICY" in
  online|quiesced) ;;
  *) echo "BACKUP_WRITER_POLICY must be online or quiesced" >&2; exit 1 ;;
esac
mkdir -p "$BACKUP_ROOT"
# Never overwrite a previous run, including another invocation in this second.
mkdir "$OUT_DIR"
touch "$OUT_DIR/INCOMPLETE"
# A failed pg_dump may leave a nonempty SQL file. Keep the marker on failure so
# restore cannot mistake nine partially written files for a complete backup.

. "$(dirname "$0")/postgres.sh"

for name in $BACKUP_DATABASES; do
  host="${name}-db"
  db="${name}_db"
  wait_for_postgres "$host" "$db"
  echo "Dumping ${db} from ${host}..."
  pg_dump -h "$host" -U postgres -d "$db" > "${OUT_DIR}/${name}.sql"
  test -s "${OUT_DIR}/${name}.sql"
done

# Commit integrity metadata before removing the completion marker. The writer
# policy records the operator's procedure; it does not pause applications itself.
(
  cd "$OUT_DIR"
  for name in $BACKUP_DATABASES; do sha256sum "${name}.sql"; done
) > "$OUT_DIR/SHA256SUMS"
{
  printf 'format=1\ncreated_at=%s\nwriter_policy=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$WRITER_POLICY"
  printf 'encryption_key=external-required\n'
} > "$OUT_DIR/backup.meta"

rm "$OUT_DIR/INCOMPLETE"
echo "Backup completed at $OUT_DIR"

# Rotate: drop timestamped dump directories older than the retention window.
if [ "$RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  # Only completed directories using our exact timestamp format are backups.
  # Leave operator directories and failed runs available for investigation.
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d \
    -name '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]' \
    -mtime "+${RETENTION_DAYS}" -exec sh -c '
      for directory do
        if [ ! -e "$directory/INCOMPLETE" ]; then rm -rf -- "$directory"; fi
      done
    ' sh {} +
  echo "Pruned backups older than ${RETENTION_DAYS} days"
fi
