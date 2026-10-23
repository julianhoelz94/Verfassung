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
| Frontend / MCP | Node | 22 LTS | CI, gateway and MCP Dockerfiles (`node:22-alpine`) |
| Frontend | Next.js | 15.5.28 | `apps/gateway-web/package.json` |
| Frontend | React / react-dom | 18.3.1 | `apps/gateway-web/package.json` |
| Frontend | TypeScript | 5.5.4 | `apps/gateway-web/package.json` |
| Frontend | ESLint + `eslint-config-next` | 8.57.0 / 15.5.28 | `apps/gateway-web/package.json` |
| Frontend | PostCSS / source-map-js | 8.5.28 / 1.2.2 | Targeted overrides in `apps/gateway-web/package.json` |
| Unit tests | Vitest / Vite | 4.1.12 / 7.3.7 | Gateway dev dependencies; Vite is pinned to the compatible supported major |
| Browser tests | Playwright | 1.55.1 | Gateway package and matching `mcr.microsoft.com/playwright:v1.55.1-jammy` visual CI image |
| Edge | Caddy | 2.9 | `infra/caddy/Dockerfile` |
| CI | GitHub Actions | SHA-pinned `actions/*@v4`, `gradle/actions/setup-gradle@v4` | `.github/workflows/ci.yml` |
| Alerts | Dependabot | weekly | `.github/dependabot.yml` |

Kotlin runtime libraries (Jackson, Actuator, Validation, JDBC, Testcontainers) follow the Spring Boot 3.5.16 BOM unless overridden.

Next.js 15.5.28 still declares PostCSS 8.4.31. The gateway overrides that dependency
and its source-map-js dependency to patched compatible releases. Re-evaluate these
overrides when upgrading Next.js; remove them only when the upstream dependency
tree itself passes the production audit. Keep the Playwright package and visual
CI image versions aligned, and verify existing screenshots after browser upgrades.

The 23 October 2026 production npm audits are clear. The full gateway audit still
flags the development-only Next ESLint → fast-glob → micromatch → braces chain
for [nested-pattern denial of service](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
No patched braces release is available at review time. The configured linter uses
repository-controlled patterns; these packages are removed from the production
image. Monitor the upstream fix rather than accepting npm's incompatible Next
lint-config downgrade suggestion.

Node 20 is [end of life](https://nodejs.org/en/about/eol); gateway runtime and CI use
the supported Node 22 line already used by MCP.
