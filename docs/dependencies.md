# Dependency inventory

Pinned versions we actually use. Upgrade one service (or the gateway) then CI, not the whole monorepo at once.

| Area | Component | Version / pin | Where |
| --- | --- | --- | --- |
| JDK | Eclipse Temurin | 21 | Host, CI `setup-java`, Kotlin Dockerfiles (`eclipse-temurin:21-jre`) |
| Gradle | Gradle | 9.7.1 | Repo wrapper (`gradle/wrapper`), CI `setup-gradle`, host `bootJar` for Kotlin images |
| Lint | Spotless + ktlint | Spotless 6.25.0 / ktlint 1.3.1 | `gradle/service-conventions.gradle`, `./gradlew check` |
| Logs | logstash-logback-encoder | 7.4 | JSON console logs + MDC `correlationId` |
| Kotlin | `kotlin("jvm")` / Spring plugin | 1.9.24 | `services/*/build.gradle.kts` |
| Spring | Spring Boot | 3.5.16 | `services/*/build.gradle.kts` (needed for Gradle 9 `bootJar`) |
| Spring | Dependency management plugin | 1.1.7 | `services/*/build.gradle.kts` |
| API docs | springdoc OpenAPI UI | 2.6.0 | `services/*/build.gradle.kts` |
| DB | PostgreSQL | 16 / `postgres:16-alpine` in tests | Compose `postgres:16`, Testcontainers |
| Migrations | Flyway | via Spring Boot BOM | `flyway-core`, `flyway-database-postgresql` |
| JDBC | PostgreSQL driver | via Spring Boot BOM | `runtimeOnly postgresql` |
| Frontend | Node | 20 | CI, `apps/gateway-web/Dockerfile` (`node:20-alpine`) |
| Frontend | Next.js | 15.5.24 | `apps/gateway-web/package.json` |
| Frontend | React / react-dom | 18.3.1 | `apps/gateway-web/package.json` |
| Frontend | TypeScript | 5.5.4 | `apps/gateway-web/package.json` |
| Frontend | ESLint + `eslint-config-next` | 8.57.0 / 15.5.24 | `apps/gateway-web/package.json` |
| Edge | Caddy | 2.9 | `infra/caddy/Dockerfile` |
| CI | GitHub Actions | SHA-pinned `actions/*@v4`, `gradle/actions/setup-gradle@v4` | `.github/workflows/ci.yml` |
| Alerts | Dependabot | weekly | `.github/dependabot.yml` |

Kotlin runtime libraries (Jackson, Actuator, Validation, JDBC, Testcontainers) follow the Spring Boot 3.5.16 BOM unless overridden.
