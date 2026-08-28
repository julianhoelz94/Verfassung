# Dependency inventory

Pinned versions we actually use. Upgrade one service (or the gateway) then CI, not the whole monorepo at once.

| Area | Component | Version / pin | Where |
| --- | --- | --- | --- |
| JDK | Eclipse Temurin | 21 | Host, CI `setup-java`, Kotlin Dockerfiles (`eclipse-temurin:21-jre`) |
| Gradle | Gradle | 8.10.2 | CI `setup-gradle`, service Dockerfiles (`gradle:8.10-jdk21`) |
| Kotlin | `kotlin("jvm")` / Spring plugin | 1.9.24 | `services/*/build.gradle.kts` |
| Spring | Spring Boot | 3.3.2 | `services/*/build.gradle.kts` |
| Spring | Dependency management plugin | 1.1.6 | `services/*/build.gradle.kts` |
| API docs | springdoc OpenAPI UI | 2.6.0 | `services/*/build.gradle.kts` |
| DB | PostgreSQL | 16 / `postgres:16-alpine` in tests | Compose `postgres:16`, Testcontainers |
| Migrations | Flyway | via Spring Boot BOM | `flyway-core`, `flyway-database-postgresql` |
| JDBC | PostgreSQL driver | via Spring Boot BOM | `runtimeOnly postgresql` |
| Frontend | Node | 20 | CI, `apps/gateway-web/Dockerfile` (`node:20-alpine`) |
| Frontend | Next.js | 14.2.5 | `apps/gateway-web/package.json` |
| Frontend | React / react-dom | 18.3.1 | `apps/gateway-web/package.json` |
| Frontend | TypeScript | 5.5.4 | `apps/gateway-web/package.json` |
| Frontend | ESLint + `eslint-config-next` | 8.57.0 / 14.2.5 | `apps/gateway-web/package.json` |
| Edge | Caddy | 2.9 | `infra/caddy/Dockerfile` |
| CI | GitHub Actions | `actions/*@v4`, `gradle/actions/setup-gradle@v4` | `.github/workflows/ci.yml` |
| Alerts | Dependabot | weekly | `.github/dependabot.yml` |

Kotlin runtime libraries (Jackson, Actuator, Validation, JDBC, Testcontainers) follow the Spring Boot 3.3.2 BOM unless overridden.
