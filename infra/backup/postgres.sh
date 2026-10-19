# Shared by the backup and restore entry points; sourced rather than executed.
BACKUP_DATABASES="catalog content amendment identity editor audit ingestion search document"

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
