# Recovery and operational checks

The automated drill uses disposable CI data. It does not certify a production
host restore. Keep the deployment sign-off and VER-269 boundary.

## Preserve a recoverable installation

Keep all nine database dumps with their Flyway history. Retain the exact
`IDENTITY_MFA_ENCRYPTION_KEY` separately in the operator's secret store: persisted
MFA and SMTP credentials depend on it. Preserve database and Audit runtime
credentials, the public origin/passkey configuration and deployment image revision.
Document files are stored in its database revisions. Never put secret values in
the backup manifest, report or tracker.

For a consistent cross-service recovery point, stop incoming traffic and all
application writers, including background delivery, before dumping. Keep databases
running. Run `backup-service` with `BACKUP_WRITER_POLICY=quiesced`; this records the
operator's procedure but does not stop writers. Ordinary runs are labeled `online`
and remain independent per-database snapshots.

New backups include UTC metadata in `backup.meta` and `SHA256SUMS` for all nine
dumps. `INCOMPLETE` remains until everything succeeds. Restore checks the expected
files before its first database write. Checksums detect changed bytes, not valid
SQL or cross-service consistency. Legacy backups without manifests are accepted
with a warning and need their original completion evidence.

Stop writers throughout restore. If SQL or connectivity fails partway, leave
applications stopped, correct the cause and rerun the complete restore from the
original verified backup. Never resume a partially restored installation.
On a fresh host, restore creates a non-login `audit_runtime` role for stored grants.
Audit's owner-authenticated Flyway startup sets its password; the application
connection has INSERT/SELECT permissions. Existing UPDATE/DELETE no-op rules
remain; runtime destructive schema/table operations are denied.

Restart with the preserved encryption key. Verify authentication/MFA, known
published texts and source documents, rebuild Search and verify results. Record
durations, database/image revisions and exclusions. Measure the actual corpus
before promising recovery-time or data-loss targets.

## Disposable full-stack drill

CI runs the drill after browser/documentation journeys. Locally use a separate
`verfassung-recovery-*` Compose project, `env/ci.env.example`, tested images and
generated API fixtures. It refuses normal local/production names, remote URLs,
production profiles and external/shared or bind-mounted database storage.

```bash
COMPOSE_FILE=docker-compose.yml:docker-compose.e2e.yml \
python3 scripts/operations/recovery_drill.py \
  --project verfassung-recovery-example \
  --confirm-disposable verfassung-recovery-example \
  --base-url http://127.0.0.1:18080 \
  --report test-results/recovery-report.json
```

Supply the same CI fixture environment/credentials used to create this stack.
The drill stops its applications, fingerprints every public table, creates a
private backup, rejects corrupt bytes before writes, empties only the disposable
schemas, exercises an SQL failure during restore, and reruns the original backup.
It compares every database before restarting, preserves the encryption key,
downloads the same public source-document revision before and after recovery and
compares its metadata and exact file bytes, then reindexes Search and verifies
real login/MFA and API fixtures. It then stops Search
to verify degraded monitoring while Identity stays healthy, restarts Search and
checks recovery. The JSON report contains outcomes/durations, never SQL rows or
secrets. CI uploads only that report. The private synthetic backup remains at the
reported `backupDirectory` for investigation; remove it after reviewing the drill.

## Read-only operational checks

Choose a stable publicly readable version, its jurisdiction UUID, a search term and
a short exact text fragment. A deliberately restricted reading policy requires a
separate authenticated browser check: this public canary reports inaccessible
content as degraded without bypassing policy. Update the canary when editorial
correction changes the snapshot indexed by Search.

Create a dedicated service token with only `operations:read` using existing admin
token controls. Supply it through secret-store environment variable
`ATLAS_OPERATIONS_TOKEN`, never a command-line argument. This scope reads only
aggregate counts/ages in Identity, Editor and Ingestion. It grants no account
management, publication, import or audit-history access. Rotate it before expiry;
HTTP 401/403 becomes an actionable credential failure.

```bash
python3 scripts/operations/check.py \
  --base-url https://your-atlas.example \
  --jurisdiction-id JURISDICTION_UUID --version-id PUBLISHED_VERSION_UUID \
  --query 'known phrase' --expected-text 'Known published wording' \
  --backup-root /path/to/verified/backups
```

The command checks published ownership, reader response, Search result, delivery
and import status, plus the latest backup's checksums and age. Defaults: five
minutes for pending work, zero failed deliveries and one day for backup age.
Adjust `--max-queue-age`, `--max-failed` and `--max-backup-age` to the agreed policy.
JSON `ok: false` and a nonzero exit code indicate degradation and its next action;
a healthy subsequent run clears it. Configure the existing monitoring system to
alert on this result and missed runs. The repository does not install a scheduler
or notification destination automatically.

Investigate owner-service logs with correlation IDs. Resume an interrupted setup
proposal after its active two-minute claim expires; do not create another
constitution or change a frozen reviewed revision to bypass it.
