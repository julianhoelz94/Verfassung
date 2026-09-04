# Constitution Atlas

Public site for versioned constitutions: countries → constitution versions → articles, with amendment history, search, and an authenticated editor.

## Stack

- Kotlin 1.9 / Java 21 / Spring Boot 3.3, Flyway, Testcontainers, OpenAPI (`springdoc`)
- Next.js 14 (App Router) + TypeScript in `apps/gateway-web`
- Docker Compose + Caddy (`infra/caddy`) as the single local entry point
- One Postgres database per stateful service (never share DBs)
- Flyway: new `V{n}__….sql` only; do not edit applied migrations

## Layout

| Path | Owns |
| --- | --- |
| `apps/gateway-web/` | Public UI / SSR |
| `services/<name>/` | One Spring Boot service + its Gradle project |
| `infra/` | Caddy, backup script |
| `env/` | Profile templates (`local-stack`, `ci`, `testing`, `production`) |
| `backlog.md` | Product + sprint backlog (large). **Grep for IDs** (`ARCH-`, `CAT-`, `CNT-`, `AMD-`, `ING-`, `UI-`, `OPS-`); do not read the whole file. |

## Commands

```bash
cp env/local-stack.env.example env/local-stack.env   # once
./manageLocalStack.sh --start                         # host bootJar + images, then http://localhost
./manageLocalStack.sh --start --no-build
./manageLocalStack.sh --rebuild <service...>          # after Flyway / gateway changes
./manageLocalStack.sh --stop
cd services/<name> && ./gradlew test                     # one service only; wrapper pins Gradle 8.10.2
./gradlew -p services/<name> check                       # tests + Spotless/ktlint
cd apps/gateway-web && npm ci && npm run lint && npm run build
```

Swagger (via Caddy): `http://localhost/api/docs/<service>/swagger-ui/index.html`  
Service names: `catalog`, `content`, `amendment`, `identity`, `editor`, `search`, `ingestion`, `audit`.

## Current sprint

See `backlog.md` **Suggested Sprint Breakdown**. Sprint 0–9 are closed. **Sprint 10** (search facets SRC-2, result provenance SRC-5) is next. Sprints 11–14 are planned. Pull from **Later / Ideas** only if the user asks. Do not start SRV-7 (MCP) until asked.

**When a story/task is finished, update `backlog.md` in the same change:** set Status to `Done`, add the ID to that sprint’s Done list, and keep the board snapshot accurate. Do not leave completed work as `Ready`.

## Cost rules for agents

- Touch **one service** (or gateway + Caddy) per task unless the user asks for a cross-cut.
- Do **not** spawn parallel subagents for a one-file or one-service change.
- Prefer built-in `explore` for search. Use project subagents only when the description matches.
- Read `README.md` and this file first. Open `backlog.md` only for the relevant epic/story IDs.
- Run tests only for the service you changed: `cd services/<name> && ./gradlew test`.
