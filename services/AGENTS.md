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

## Conventions

- Layers: Controller → Service → Repository + DTOs. No persistence entities as public API.
- Package: `com.constitutionatlas.<service>`
- Schema: Flyway in `src/main/resources/db/migration/`
- Tests: Testcontainers Postgres smoke already exists; add API tests next to it
- Structured JSON logs; no secrets in logs

Change one service at a time. Copy a sibling service rather than inventing a new Gradle layout.
