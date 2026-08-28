# 0001 — Platform boundaries

Status: Accepted  
Date: 2026-08-28

## Context

Constitution Atlas is a public site over versioned constitutions. Several services need state. Sharing one Postgres would couple deploys and make ownership unclear.

## Decision

- Each stateful Spring service owns **one** Postgres database. There are no cross-service foreign keys or SQL joins.
- Composition happens in `gateway-web` over HTTP, or later via events. Search and audit are derived, not authorities for article text.
- Local and (later) hosted entry is a **single Caddy reverse proxy**. Browsers talk to `http://localhost` (or the public host), not to individual service ports.
- Schema changes are Flyway forward-only (`V{n}__….sql`). JSONB is allowed for payloads (import staging, draft snapshots, audit). An outbox table can be added later per service; it is not required yet.

## Consequences

- Duplicate identifiers (for example catalog `version_id` vs content `version_id`) stay opaque UUIDs.
- Restores and backups are per database (`infra/backup`).
- Adding a service means a new Gradle project, a Compose DB, and a Caddy route — not a shared schema.
