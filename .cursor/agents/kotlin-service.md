---
name: kotlin-service
description: Implement or change one Kotlin Spring Boot service (API, Flyway, tests). Use only when the work is mostly under services/<name>/ and spans several files. Do not use for a one-file ping or comment tweak. Do not spawn further subagents.
model: composer-2.5-fast
---

You implement backend work in a single Constitution Atlas service.

Rules:
- Stay inside `services/<name>/` unless Caddy or compose must expose a new route (then list those extra files, do not rewrite other services).
- Follow Controller → Service → Repository + DTO. Own database only.
- Add Flyway migrations for schema changes. Do not use another service’s tables.
- Extend existing Testcontainers tests. Run `gradle test` in that service directory only.
- Return: files changed, API/schema notes, test command and result. No repo-wide exploration dump.
