# Constitution Atlas

Public site for versioned constitutions: countries → constitution versions → articles, with amendment history, search, and an authenticated editor.

## Stack

- Kotlin 1.9 / Java 21 / Spring Boot 3.3, Flyway, Testcontainers, OpenAPI (`springdoc`)
- Next.js 14 (App Router) + TypeScript in `apps/gateway-web`
- Docker Compose + Caddy (`infra/caddy`) as the single local entry point
- One Postgres database per stateful service (never share DBs)

## Layout

| Path | Owns |
| --- | --- |
| `apps/gateway-web/` | Public UI / SSR |
| `services/<name>/` | One Spring Boot service + its Gradle project |
| `infra/` | Caddy, backup script |
| `env/` | Profile templates (`local-stack`, `ci`, `testing`, `production`) |
| `backlog.md` | Product + sprint backlog (large). **Grep for IDs** (`ARCH-`, `CAT-`, `CNT-`, `UI-`, `OPS-`); do not read the whole file. |

## Commands

```bash
cp env/local-stack.env.example env/local-stack.env   # once
./manageLocalStack.sh --start                         # http://localhost
./manageLocalStack.sh --stop
cd services/<name> && gradle test                     # one service only
cd apps/gateway-web && npm ci && npm run lint && npm run build
```

Swagger (via Caddy): `http://localhost/api/docs/<service>/swagger-ui/index.html`  
Service names: `catalog`, `content`, `amendment`, `identity`, `editor`, `search`, `ingestion`, `audit`.

## Current state (Sprint 0)

Scaffolds exist: health/actuator, `/internal/ping`, Flyway `V1__init.sql` bootstrap marker, Testcontainers smoke tests, CI matrix. **No domain APIs yet.** Next work: replace pings with owned REST + real migrations, keep DBs isolated.

## Cost rules for agents

- Touch **one service** (or gateway + Caddy) per task unless the user asks for a cross-cut.
- Do **not** spawn parallel subagents for a one-file or one-service change.
- Prefer built-in `explore` for search. Use project subagents only when the description matches.
- Read `README.md` and this file first. Open `backlog.md` only for the relevant epic/story IDs.
- Run tests only for the service you changed: `cd services/<name> && gradle test`.
