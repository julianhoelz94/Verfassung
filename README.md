# Constitution Atlas

Public site for versioned constitutions: countries → versions → articles, with amendment history, search, and an authenticated editor.

This repo is a **monorepo**: Kotlin Spring Boot services, a Next.js gateway, Docker Compose, and Caddy as the local entry point. Each stateful service has its own Postgres database (never shared).

Product work and sprint status live in [`backlog.md`](backlog.md). This file is only how to run and navigate the repo.

## Host prerequisites (install yourself)

These are not provided by the repo. Docker Compose images already contain Java, Gradle, Node, Caddy, and Postgres; you still need Docker on the host.

| Tool | Version | Needed for | Install |
| --- | --- | --- | --- |
| Docker Desktop | current, with the engine running | Local stack (`./manageLocalStack.sh`) and Testcontainers | [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/) |
| Temurin JDK | **21** (LTS) | `cd services/<name> && gradle test` on the host | [Adoptium Temurin 21](https://adoptium.net/temurin/releases/?version=21) (macOS `.pkg` needs admin). Without sudo: unpack the macOS aarch64/x64 `.tar.gz` under `~/.local/java/temurin-21` (`Contents/Home`) and set `JAVA_HOME` + `PATH` in `~/.zshrc`. |
| Gradle | **8.10.2** (matches CI and service Dockerfiles) | Host `gradle test` / `bootJar` | [Gradle 8.10.2](https://gradle.org/releases/) binary zip; put `bin` on `PATH`. Homebrew’s `gradle` formula is currently 9.x and is **not** the version this repo uses. |
| Node.js + npm | **20** | `cd apps/gateway-web && npm ci && npm run lint && npm run build` | [Node 20](https://nodejs.org/) or `nvm install 20` |

Check:

```bash
docker info
java -version    # OpenJDK 21, Temurin
gradle -v        # 8.10.x
node -v          # v20.x
```

You do **not** install Postgres, Caddy, or Spring Boot on the host for the Compose workflow.

## Quick start

```bash
cp env/local-stack.env.example env/local-stack.env   # once
./manageLocalStack.sh --start
```

Then open:

- App: <http://localhost>
- API docs: `http://localhost/api/docs/<service>/swagger-ui/index.html`

Service names: `catalog`, `content`, `amendment`, `identity`, `editor`, `search`, `ingestion`, `audit`.

```bash
./manageLocalStack.sh --stop    # keeps named database volumes
./manageLocalStack.sh --reset   # destructive: compose down -v, then Docker prune
```

`--start` builds images one service at a time (avoids Docker Desktop OOM). First start is slow because each Kotlin image runs `gradle bootJar` inside Docker.

## Backup and restore

`infra/backup/backup.sh` dumps all eight databases (including `search`) into `./backups/<timestamp>/`. Compose runs it on the `backup-service` container.

Restore drill (destroys current rows in those databases):

```bash
# after a dump exists, e.g. backups/20260828-120000/
docker compose --env-file env/local-stack.env run --rm --entrypoint sh backup-service /backup/restore.sh /backups/20260828-120000
```

Then restart the app containers so they reconnect. Flyway history is part of each dump.

## Layout

| Path | Owns |
| --- | --- |
| `apps/gateway-web/` | Public UI (Next.js 14) |
| `services/<name>/` | One Spring Boot service + Gradle project |
| `infra/caddy/` | Edge proxy |
| `infra/backup/` | `pg_dump` helper (writes to `./backups`, gitignored) |
| `env/` | Profile templates |
| `.github/workflows/ci.yml` | Per-service `gradle test`, frontend lint/build, and image builds |

## Environment profiles

Copy the matching `env/*.env.example` file. Do not commit real `*.env` files.

| Profile | Use |
| --- | --- |
| `local-stack` | Day-to-day Compose |
| `ci` | GitHub Actions / automation |
| `testing` | Staging-like |
| `production` | Live (placeholders only in git) |

Examples include local user emails/passwords. Identity seeds those users on startup (`POST /api/identity/login`).

## Tests

```bash
cd services/<name> && gradle test
cd apps/gateway-web && npm ci && npm run lint && npm run build
```

Backend smoke tests use Testcontainers (`postgres:16-alpine`). CI discovers every `services/*/build.gradle.kts` and runs `gradle test` there.

## Current shape

Browse APIs and seed data exist for catalog and content; identity login, editor drafts, and audit append are in later sprints’ Done lists. See [`backlog.md`](backlog.md).

For current sprint scope and task IDs, see [`backlog.md`](backlog.md) (grep `CAT-`, `CNT-`, `OPS-`, `UI-`). Platform decisions: [`docs/adr/0001-platform-boundaries.md`](docs/adr/0001-platform-boundaries.md). Dependency pins: [`docs/dependencies.md`](docs/dependencies.md).
