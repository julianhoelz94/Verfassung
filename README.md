# Constitution Atlas

Public site for versioned constitutions: countries → versions → articles, with amendment history, search, and an authenticated editor.

This repo is a **monorepo**: Kotlin Spring Boot services, a Next.js gateway, Docker Compose, and Caddy as the local entry point. Each stateful service has its own Postgres database (never shared).

Product work and sprint status live in [`backlog.md`](backlog.md). This file is only how to run and navigate the repo.

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

## Layout

| Path | Owns |
| --- | --- |
| `apps/gateway-web/` | Public UI (Next.js 14) |
| `services/<name>/` | One Spring Boot service + Gradle project |
| `infra/caddy/` | Edge proxy |
| `infra/backup/` | `pg_dump` helper (writes to `./backups`, gitignored) |
| `env/` | Profile templates |
| `.github/workflows/ci.yml` | Per-service `gradle test` + frontend lint/build |

## Environment profiles

Copy the matching `env/*.env.example` file. Do not commit real `*.env` files.

| Profile | Use |
| --- | --- |
| `local-stack` | Day-to-day Compose |
| `ci` | GitHub Actions / automation |
| `testing` | Staging-like |
| `production` | Live (placeholders only in git) |

Examples include local user emails/passwords for later identity work. They are not wired up yet.

## Tests

```bash
cd services/<name> && gradle test
cd apps/gateway-web && npm ci && npm run lint && npm run build
```

Backend smoke tests use Testcontainers (`postgres:16-alpine`). CI discovers every `services/*/build.gradle.kts` and runs `gradle test` there.

## What the scaffold includes

Runnable skeletons only: actuator health, `/internal/ping`, Flyway `V1__init.sql` marker, named Postgres volumes, Caddy routes for Swagger. There are **no domain APIs or seed constitutions** yet.

For current sprint scope and task IDs, see [`backlog.md`](backlog.md) (grep `CAT-`, `CNT-`, `OPS-`, `UI-`).
