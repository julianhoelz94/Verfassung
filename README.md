# Constitution Atlas

Public site for versioned constitutions: countries → versions → articles, with amendment history, search, and an authenticated editor.

This repo is a **monorepo**: Kotlin Spring Boot services, a Next.js gateway, Docker Compose, and Caddy as the local entry point. Each stateful service has its own Postgres database (never shared).

Product work and sprint status live in [`backlog.md`](backlog.md). This file is only how to run and navigate the repo.

## Host prerequisites (install yourself)

The local stack needs only OrbStack (preferred) or another Docker-compatible engine with Compose, Bash, and curl. Compilation and fixture upload run in containers. The Java and Node tools below are optional for running checks outside Docker.

| Tool | Version | Needed for | Install |
| --- | --- | --- | --- |
| OrbStack or Docker Desktop | current, with the engine running | Local stack (`./manageLocalStack.sh`) and Testcontainers | [OrbStack](https://orbstack.dev/) or [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/) |
| Temurin JDK | **21** (LTS) | Optional host service tests/builds | [Adoptium Temurin 21](https://adoptium.net/temurin/releases/?version=21) (macOS `.pkg` needs admin). Without sudo: unpack the macOS aarch64/x64 `.tar.gz` under `~/.local/java/temurin-21` (`Contents/Home`) and set `JAVA_HOME` + `PATH` in `~/.zshrc`. |
| Gradle | **9.7.1** (matches CI and the repo wrapper) | Host `./gradlew test` / `bootJar` | Wrapper at repo root (`./gradlew`); each `services/<name>/gradlew` delegates to it. Prefer the wrapper over Homebrew’s `gradle` formula so the patch version stays pinned. |
| Node.js + npm | **20** | `cd apps/gateway-web && npm ci && npm run lint && npm run build` | [Node 20](https://nodejs.org/) or `nvm install 20` |

Check:

```bash
docker info
java -version    # OpenJDK 21, Temurin
gradle -v        # optional; prefer ./gradlew -v (9.7.1)
node -v          # v20.x
```

You do **not** install Postgres, Caddy, or Spring Boot on the host for the Compose workflow.

## Quick start

```bash
cp env/local-stack.env.example env/local-stack.env   # once
./manageLocalStack.sh --start
```

- App: <http://localhost>
- Search: <http://localhost/search>
- Compare (seed DE): <http://localhost/countries/DE/compare>
- API docs: `http://localhost/api/docs/<service>/swagger-ui/index.html`

Service names: `catalog`, `content`, `amendment`, `identity`, `editor`, `search`, `ingestion`, `audit`, `document`, `mcp`.

```bash
./manageLocalStack.sh --start              # serial container builds, then up and prepopulate
./manageLocalStack.sh --start --no-build   # fast restart using existing images, then prepopulate
./manageLocalStack.sh --start --no-prepopulate # start without fixture data
./manageLocalStack.sh --only-prepopulate   # populate an already running stack
./manageLocalStack.sh --only-prepopulate --verify-only # check fixtures without uploading
./manageLocalStack.sh --rebuild content-service amendment-service gateway-web
./manageLocalStack.sh --rebuild --no-prepopulate catalog-service
./manageLocalStack.sh --status
./manageLocalStack.sh --stop               # keeps named database volumes
./manageLocalStack.sh --reset              # compose down -v only
./manageLocalStack.sh --reset --prune      # also docker system prune -af
```

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

`infra/backup/backup.sh` dumps all nine service databases (including `search` and `document`) into `./backups/<timestamp>/`. Compose runs it on the `backup-service` container.

Restore drill (destroys current rows in those databases):

```bash
# after a dump exists, e.g. backups/20260828-120000/
docker compose --env-file env/local-stack.env run --rm --entrypoint sh backup-service /backup/restore.sh /backups/20260828-120000
```

Then restart the app containers so they reconnect. Flyway history is part of each dump.

## Layout

| Path | Owns |
| --- | --- |
| `apps/gateway-web/` | Public UI (Next.js 15) |
| `services/<name>/` | One Spring Boot service + Gradle project |
| `infra/caddy/` | Edge proxy |
| `infra/backup/` | `pg_dump` helper (writes to `./backups`, gitignored) |
| `env/` | Profile templates |
| `docs/CODEMAPS/` | Agent navigation maps (start at [`INDEX.md`](docs/CODEMAPS/INDEX.md)) |
| `.github/workflows/ci.yml` | Per-service `./gradlew check`, frontend lint/build, and image builds |

## Environment profiles

Copy the matching `env/*.env.example` file. Do not commit real `*.env` files.

| Profile | Use |
| --- | --- |
| `local-stack` | Day-to-day Compose |
| `ci` | GitHub Actions / automation |
| `testing` | Staging-like |
| `production` | Live (placeholders only in git) |

Examples include local user emails/passwords. Identity seeds those users on startup (`POST /api/identity/login`). Editorial capabilities: [`docs/editorial-roles.md`](docs/editorial-roles.md).

## Tests

```bash
cd services/<name> && ./gradlew test
./gradlew -p services/<name> check
cd apps/gateway-web && npm ci && npm run lint && npm run build
```

Backend smoke tests use Testcontainers (`postgres:16-alpine`). CI discovers every `services/*/build.gradle.kts` and runs `./gradlew check` there (JUnit + Spotless/ktlint). The Gradle wrapper at the repo root is 9.7.1; service `gradlew` scripts call it with `-p`.

## Current shape

Browse APIs and seed data exist for catalog and content; identity login, editor drafts, and audit append are in later sprints’ Done lists. See [`backlog.md`](backlog.md).

For current sprint scope and task IDs, see [`backlog.md`](backlog.md) (grep `CAT-`, `CNT-`, `OPS-`, `UI-`). Platform decisions: [`docs/adr/0001-platform-boundaries.md`](docs/adr/0001-platform-boundaries.md). Dependency pins: [`docs/dependencies.md`](docs/dependencies.md).
