# Dependency inventory

Pinned versions we actually use. Validate one consumer first, then the complete coordinated change. Follow the [upgrade checklist](dependency-upgrades.md).

| Area | Component | Version / pin | Where |
| --- | --- | --- | --- |
| JDK | Eclipse Temurin | 21 | Host, CI `setup-java`, Kotlin Dockerfiles (`eclipse-temurin:21-jre`) |
| Gradle | Gradle | 9.8.2 | Repo wrapper (`gradle/wrapper`), CI `setup-gradle`, host `bootJar` for Kotlin images |
| Lint | Spotless + ktlint | Spotless 8.10.4 / ktlint 1.3.1 | `gradle/service-conventions.gradle`, `./gradlew check` |
| Logs | logstash-logback-encoder | 7.4 | JSON console logs + MDC `correlationId` |
| Kotlin | `kotlin("jvm")` / Spring plugin | 2.4.21 | `services/*/build.gradle.kts` |
| Spring | Spring Boot | 4.1.2 | Service plugins and platform BOM in `services/*/build.gradle.kts` |
| Spring | Dependency management plugin | 1.1.7 | `services/*/build.gradle.kts` |
| API docs | springdoc OpenAPI UI | 3.2.0 | `services/*/build.gradle.kts` |
| DB | PostgreSQL | 16 / `postgres:16-alpine` in tests | Compose `postgres:16`, Testcontainers |
| Migrations | Flyway | via Spring Boot BOM | `spring-boot-starter-flyway`, `flyway-database-postgresql` |
| JDBC | PostgreSQL driver | via Spring Boot BOM | `runtimeOnly postgresql` |
| Frontend / MCP | Node | 22 LTS | CI, gateway and MCP Dockerfiles (`node:22-alpine`) |
| Frontend | Next.js | 16.4.3 | `apps/gateway-web/package.json` |
| Frontend | React / react-dom | 19.3.1 | `apps/gateway-web/package.json` |
| Frontend | TypeScript | 5.5.4 | `apps/gateway-web/package.json`; compiler API compatibility retained |
| MCP | TypeScript | 7.0.2 | Native CLI compiler in `services/mcp-server/package.json` |
| Frontend / MCP | Node types | 22.20.5 | Matched to Node 22 runtime |
| Frontend | ESLint + `eslint-config-next` | 9.39.5 / 16.4.3 | `apps/gateway-web/package.json` |
| Frontend | PostCSS / source-map-js | 8.5.23 / 1.2.2 | Resolved through Next 16; no overrides |
| Unit tests | Vitest / Vite | 4.1.12 / 7.3.7 | Gateway dev dependencies; Vite is pinned to the compatible supported major |
| Browser tests | Playwright | 1.55.1 | Gateway package and matching `mcr.microsoft.com/playwright:v1.55.1-jammy` visual CI image |
| CI | Ubuntu | 24.04 | All GitHub-hosted jobs; update after verifying the build tools and Playwright OS support |
| Edge | Caddy | 2.10 | `infra/caddy/Dockerfile` |
| CI | GitHub Actions | SHA-pinned checkout v7.0.1, setup-java v6.1.0, setup-node v7.1.0, upload-artifact v7.0.2, setup-gradle v6.4.0 | `.github/workflows/ci.yml` |
| Alerts | Dependabot | weekly | `.github/dependabot.yml` |

Spring libraries (Jackson, Actuator, Validation, JDBC, Testcontainers) follow the Spring Boot 4.1.2 BOM. Kotlin JVM/Spring plugins, stdlib and reflect stay on 2.4.21 through the shared Kotlin BOM property override. Testcontainers 2 uses its renamed artifacts; Java remains 21.

The 26 October 2026 production and full gateway npm audits are clear. Next 16's
normal dependency tree passes the production audit, so the old PostCSS and
source-map-js overrides are removed. MCP's production audit is also clear.
Keep Playwright and its visual CI image aligned, and inspect screenshots after
browser upgrades.

Node 20 is [end of life](https://nodejs.org/en/about/eol); gateway runtime and CI use
the supported Node 22 line already used by MCP.

## Compatibility decisions

Kotlin 2.4.21 lists Gradle 9.7.0 as its maximum fully supported release and permits newer releases with possible warnings. The existing Gradle 9.8.2 wrapper is retained and explicitly tested with this Kotlin version; do not downgrade it based only on the compatibility table.

ESLint 9.39.5 is a temporary compatibility choice. Next 16.4.3 accepts ESLint 10, but its current React and JSX accessibility plugins still declare peers only through ESLint 9. Move to ESLint 10 when those plugins support it; do not install with forced peer resolution. Gateway TypeScript 7 remains deferred until its complete compiler API/tooling path has been validated. MCP uses only the native compiler CLI and is tested separately on Node 22 and Alpine.

Node 26 runtime/types and Java 25 are separate platform decisions. Node 22 and Java 21 remain in CI and production images. Java 24 proposals are obsolete and are not adopted. Match future runtime upgrades across toolchains, CI, type packages and every image stage.
