---
name: new-kotlin-service
description: Scaffold a new Kotlin Spring Boot microservice by copying an existing service. Use when adding a service folder, Dockerfile, compose DB, Caddy docs route, or CI matrix entry.
disable-model-invocation: true
---

# New Kotlin service

Copy a sibling under `services/` (e.g. `catalog-service`). Do not invent a new Gradle layout.

Checklist:
1. Folder `services/<name>/` with `build.gradle.kts` (Spotless plugin + `apply` of `gradle/service-conventions.gradle`), `settings.gradle.kts`, stub `gradlew` (copy a sibling), Dockerfile (`COPY build/libs/app.jar` onto `eclipse-temurin:21-jre`), `Application.kt`, `CorrelationIdFilter.kt`, `application.yml`, `logback-spring.xml`, `V1__init.sql`, `SmokeTest.kt`.
2. Package `com.constitutionatlas.<short>`.
3. Own `*-db` in `docker-compose.yml` if it has state.
4. Add to `BUILD_ORDER` in `manageLocalStack.sh`.
5. Caddy `/api/docs/<short>*` route if it exposes springdoc.
6. CI matrix in `.github/workflows/ci.yml`.
7. One Testcontainers smoke test: `SELECT 1`.

Do not share another service’s database. Later-phase services (`translation`, `mcp-server`, etc.) stay out of Compose until the user asks.
