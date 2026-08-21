#!/bin/sh
set -eu

TS="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="/backups/$TS"
mkdir -p "$OUT_DIR"

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
  wait_for_postgres "$host" "$db"
  echo "Dumping ${db} from ${host}..."
  pg_dump -h "$host" -U postgres -d "$db" > "${OUT_DIR}/${name}.sql"
done

echo "Backup completed at $OUT_DIR"
