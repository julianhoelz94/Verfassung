# Backend services

Each folder is an independent Gradle project (`com.constitutionatlas.<service>`).

## Ownership (do not cross DB boundaries)

- `catalog-service`: countries, constitutions, version metadata
- `content-service`: articles, ordering, versioned text
- `amendment-service`: amendments, diffs, version transitions
- `identity-service`: users, roles, sessions
- `editor-service`: drafts, preview, publish commands
- `search-service`: derived full-text index (not source of truth)
- `ingestion-service`: import jobs, validation, staging
- `audit-service`: append-only audit events

Writes go only to the owning service. Cross-service data via REST/events, never another service’s schema.

Route and table maps: [`docs/CODEMAPS/backend.md`](../docs/CODEMAPS/backend.md), [`docs/CODEMAPS/data.md`](../docs/CODEMAPS/data.md). Jump table: [`docs/CODEMAPS/INDEX.md`](../docs/CODEMAPS/INDEX.md).

## Conventions

- Layers: Controller → Service → Repository + DTOs. No persistence entities as public API.
- Package: `com.constitutionatlas.<service>`
- Schema: Flyway in `src/main/resources/db/migration/`. Forward-only: add `V{n}__….sql`, never edit a migration that may already have been applied.
- Tests: Testcontainers Postgres smoke already exists; add API tests next to it
- Structured JSON logs (`logback-spring.xml`); actuator `/health` and `/info`; `X-Correlation-Id` (allow-listed) and problem JSON for 401/403/404 come from `services/platform` (`includeBuild("../platform")` + `com.constitutionatlas:platform:0.1.0`). Do not copy `CorrelationIdFilter`, `NotFoundException`, or the identity Bearer client.
- Gradle: Spotless/ktlint via `gradle/service-conventions.gradle`; `cd services/<name> && ./gradlew test`

Change one service at a time. New services depend on `services/platform` for the shared filter, exceptions, and identity client; copy a sibling only for Gradle/Docker layout.
