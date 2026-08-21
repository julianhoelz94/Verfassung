# Constitution Atlas

Monorepo scaffold for a constitution platform with Kotlin Spring Boot microservices, a Next.js frontend, Docker Compose local stack, Caddy reverse proxy, backup job, and CI.

## Quick start

1. Copy env profile:
   - `cp env/local-stack.env.example env/local-stack.env`
2. Start local stack:
   - `./manageLocalStack.sh --start`
3. Open:
   - App: `http://localhost`
   - Catalog API docs: `http://localhost/api/docs/catalog/swagger-ui/index.html`
   - Content API docs: `http://localhost/api/docs/content/swagger-ui/index.html`

Stop the stack:

- `./manageLocalStack.sh --stop`

Reset the stack (destructive Docker prune):

- `./manageLocalStack.sh --reset`

## Profiles

- `env/local-stack.env.example`
- `env/ci.env.example`
- `env/testing.env.example`
- `env/production.env.example`

Each profile has dedicated seeded user accounts and credentials placeholders.

## Sprint 0 — Foundation status

Sprint 0 is focused on a runnable multi-service foundation with local orchestration and CI.

Implemented:

- Kotlin Spring Boot service skeletons for all core services.
- Docker Compose topology for gateway, edge proxy, services, and per-service Postgres instances.
- Flyway baseline migration per service (`db/migration/V1__init.sql`).
- CI pipeline running backend tests per service and frontend lint/build.
- Testcontainers-based smoke tests that boot each service and verify PostgreSQL connectivity.

Remaining to start Sprint 1 feature work:

- Replace placeholder internal ping endpoints with domain APIs.
- Add service-specific schema migrations and repositories.
- Add contract and integration tests for first real read/write use cases.
