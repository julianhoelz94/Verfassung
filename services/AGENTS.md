# Backend services

Each `services/<name>-service` is an independent Gradle project and owns its database. Ownership, routes, and tables: [`backend map`](../docs/CODEMAPS/backend.md), [`data map`](../docs/CODEMAPS/data.md). Exchange data through HTTP/events, never cross-service SQL or FKs.

- Use Controller → Service → Repository with public DTOs, not persistence types.
- Add `src/main/resources/db/migration/V{n}__….sql` for schema changes; never edit applied migrations.
- Reuse `services/platform` for correlation IDs, common exceptions, and the identity Bearer client; do not copy them.
- Extend relevant Testcontainers tests; run `./gradlew test` in the changed service.
- Keep controllers thin; domain rules belong in services. Preserve structured JSON logs, correlation IDs, and actuator health/info through the shared platform conventions.
- Use JUnit 5 + Testcontainers Postgres; extend an existing test container when suitable.
