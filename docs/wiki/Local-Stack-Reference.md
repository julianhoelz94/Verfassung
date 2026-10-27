# Local stack reference

For a first run, use [[Development and operations|Technical-Development]].

`--start` compiles all nine Kotlin services with Java 21 inside Docker and builds the gateway, MCP server, and Caddy images. Builds run **one image at a time**; Gradle uses one worker and no parallel projects. A daemon-wide lock rejects overlapping local-stack builds, including from other checkouts. Compilation output streams to the terminal and to the `build-monitor` container: open it in OrbStack and select **Logs** to follow every build. The log remains in `.local-stack/build.log`; Docker BuildKit also retains build records (`docker buildx history ls`). No host JARs, JDK, Node installation, or `npm ci` are needed for this flow. Each local Java service uses a 256 MiB maximum heap and Serial GC to leave room for the other services in the VM (`LOCAL_JAVA_TOOL_OPTIONS` overrides these JVM options). Linux build outputs stay inside Docker, and a locked Gradle dependency cache is reused between builds.

Existing env files gain only missing keys from the local example on startup; configured values are preserved. This supplies new local service-token settings to older checkouts.

The script uses `docker-compose.yml` plus `docker-compose.local.yml`, with the stable Compose project name `verfassung` (override with `COMPOSE_PROJECT_NAME`). CI retains its tested-JAR packaging flow. After source changes, use `--rebuild <service...>`; catalog/content rebuilds also recreate search so its derived index rebuilds. `--start --no-build` restarts existing images. Every start/rebuild checks all nine private service health endpoints, including document-service, before reporting success, independently of public browsing quotas.

`--start` and `--rebuild` then run the `prepopulate` container, which generates deterministic fixtures, uploads through the real APIs with separate reviewer/publisher accounts, checks existing records, and rebuilds/verifies search. It uses the seeded accounts in `env/local-stack.env`; read-back requests authenticate too, so quotas or disabled anonymous browsing do not block fixture maintenance. The container shares Caddy's network namespace so the localhost-only safety guard remains enforced. Fixture verification keeps the original legal IDs and checks the current search snapshot separately, so additional local data and published editorial corrections do not break restarts. Interrupted fixture imports resume from their existing review/publication state after matching the staged source content. Repeated uploads reuse existing fixture IDs; `--only-prepopulate --verify-only` checks saved content without uploading or rebuilding search. Runtime IDs are saved to `apps/gateway-web/e2e/fixtures/generated/.runtime/prepopulate-ids.json`. Use `--no-prepopulate` to skip fixture changes.

The script uses the selected Docker context. Select OrbStack with `docker context use orbstack`; if that engine is stopped on macOS, the script opens OrbStack. Other contexts retain the Docker Desktop startup fallback. Inspect containers and images in OrbStack, or use `./manageLocalStack.sh --status`. If a build was forcibly killed and left `verfassung-local-build-lock`, verify that no build is running before removing that lock container with `docker rm verfassung-local-build-lock`.

Backups are an explicit one-shot operation in the local stack rather than an application container started on every boot:

```bash
docker compose -p verfassung -f docker-compose.yml -f docker-compose.local.yml --env-file env/local-stack.env run --rm backup-service
```

## Backup and restore

`infra/backup/backup.sh` dumps all nine service databases (including `search` and `document`) into `./backups/<timestamp>/`. Compose runs it on the `backup-service` container. Files and directories are owner-only. A run refuses to overwrite an existing timestamp and keeps an `INCOMPLETE` marker until every dump succeeds. Failed runs retain that marker and their diagnostic dumps; restore rejects them even if every SQL file is nonempty. Retention removes only completed timestamp directories, preserving failed runs and unrelated operator directories. Standalone use may set `BACKUP_ROOT` (default `/backups`); Compose mounts `./backups` there.

Restore drill (destroys current rows in those databases):

```bash
# after a dump exists, e.g. backups/20260828-120000/
docker compose -p verfassung -f docker-compose.yml -f docker-compose.local.yml --env-file env/local-stack.env run --rm --entrypoint sh backup-service /backup/restore.sh /backups/20260828-120000
```

Stop application writers before the restore drill and use the same Compose project name as the running stack. New backups include UTC metadata and SHA-256 checksums. Restore rejects `INCOMPLETE` runs and verifies all nine dumps and checksums before replacing any schema. Older backups without manifests remain supported with a warning and require their original completion evidence. Checksums do not validate SQL or make the restore atomic. Stop all writers during backup for a consistent cross-service recovery point and record `BACKUP_WRITER_POLICY=quiesced`.

Then restart the app containers so they reconnect. Flyway history is part of each dump.

Preserve `IDENTITY_MFA_ENCRYPTION_KEY` separately alongside deployment configuration. The [recovery and monitoring guide](https://github.com/julianhoelz94/Verfassung/blob/main/docs/operations/recovery-and-monitoring.md) covers interrupted restores, the restricted Audit runtime role, the disposable full-stack drill and read-only usability checks. CI's drill verifies database contents, real authentication/API fixtures and Search recovery; it is not a production-host certification.


[[Development and operations|Technical-Development]]

## Environment profiles

Copy the matching example; never commit secrets.

| Profile | Use |
| --- | --- |
| local-stack | Local Compose development |
| ci | Automated test fixtures |
| testing | Staging-like configuration |
| production | Deployment placeholders; no verified rollout yet |
