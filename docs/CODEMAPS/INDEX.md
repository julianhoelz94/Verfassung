<!-- Generated: 2026-09-06 | Files scanned: ~250 | Token estimate: ~700 -->
# Repo map (agents)

Navigation only. Rules stay in `AGENTS.md`. If a path here disagrees with code, trust the code.

**Read this file, then exactly one area map**, then the files it names. Do not walk the whole tree to find an owner. Do not read `backlog.md` in full — grep a story ID.

| Area | File | Use when |
| --- | --- | --- |
| System | [architecture.md](architecture.md) | Who owns data, how a request flows, Caddy vs Docker URLs |
| APIs | [backend.md](backend.md) | REST routes, Kotlin packages, cross-service HTTP |
| UI | [frontend.md](frontend.md) | Next.js pages, clients, session cookie |
| Schema | [data.md](data.md) | Tables, Flyway files, ID rules |
| Run | [infra.md](infra.md) | Compose, Caddy, env, Gradle, CI |

## Jump table

| I want to… | Map | Open first |
| --- | --- | --- |
| Change a public page | frontend | `apps/gateway-web/app/` matching route |
| Fetch catalog/content/search | frontend | `apps/gateway-web/lib/api.ts` |
| Login, MFA, users, roles | frontend + backend | `lib/session.ts`, `lib/identity-client.ts`, `services/identity-service` |
| Draft / review / publish | frontend + backend | `app/editor/`, `lib/editor-api.ts`, `services/editor-service` |
| Add or change a REST route | backend | `services/<name>/…/api/*Controller.kt` |
| Add a table or column | data | next `V{n}__….sql` in that service only |
| Outline / node kinds | backend + data | catalog `content-outline`, `constitution_node_kinds` |
| Article text / tree | backend + data | content `ArticleController`, `content_nodes` |
| Amendments / timeline | backend + frontend | amendment-service, `app/countries/[code]/timeline` |
| Full-text search | backend | search-service `SearchController`, `search_documents` |
| JSON import | backend + frontend | ingestion-service, `app/admin/import` |
| Audit log | backend | audit-service `AuditController` (append-only) |
| Caddy route / Compose / env | infra | `infra/caddy/Caddyfile`, `docker-compose.yml`, `env/` |
| Local start/stop | infra | `./manageLocalStack.sh` |
| Editorial capabilities | — | `docs/editorial-roles.md` |
| Why separate DBs | — | `docs/adr/0001-platform-boundaries.md` |
| Published versions immutable | — | `docs/adr/0002-immutable-published-versions.md` |
| Version pins | — | `docs/dependencies.md` |
| UI concept / tokens | frontend | `docs/design/`, `app/globals.css` |
| Sprint / story status | — | grep `backlog.md` for `CAT-` `CNT-` `UI-` `IDN-` `OPS-` |

## Package layout (every Kotlin service)

```
services/<name>/
  src/main/kotlin/com/constitutionatlas/<short>/
    *Application.kt          boot + GET /ping
    CorrelationIdFilter.kt   X-Correlation-Id
    api/                     Controller, Dtos, Advice
    service/                 domain rules
    repo/                    JdbcTemplate only (no JPA)
    client/                  HTTP to another service (if any)
  src/main/resources/db/migration/V{n}__….sql
  src/test/kotlin/SmokeTest.kt + *ApiTest.kt
```

## Do not

- Join across service databases or add cross-service FKs.
- Edit an applied Flyway file; add `V{n+1}`.
- Treat search or audit as source of truth for article text.
- Start SRV-7 (MCP) or extra services unless asked.
