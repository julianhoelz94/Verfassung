<!-- Reviewed: 2026-10-19 -->
# Infra

**Rules:** `infra/AGENTS.md`, `.agents/skills/local-stack`
**Pins:** `docs/dependencies.md`

## Local stack

```
./manageLocalStack.sh --start              # serial container compilation + images + up + fixtures
./manageLocalStack.sh --start --no-build
./manageLocalStack.sh --rebuild <compose-service...>
./manageLocalStack.sh --only-prepopulate [--verify-only]
./manageLocalStack.sh --stop               # keep volumes
./manageLocalStack.sh --reset              # down -v
./manageLocalStack.sh --reset --prune      # also docker system prune -af
```

Env: copy `env/local-stack.env.example` → `env/local-stack.env` (gitignored). Profiles: `local-stack`, `ci`, `testing`, `production`.

Local builds: `docker-compose.local.yml` selects the shared `infra/local-stack/Dockerfile` (Java 21 source build → non-root JRE). The script builds one image at a time, uses one Gradle worker and a locked dependency cache, and rejects overlapping builds with a daemon-wide container lock. CI keeps `services/*/Dockerfile` to package its tested host-built JARs. Gateway, MCP, and Caddy also compile/build in Docker.

The local override makes backups opt-in and adds the `prepopulate` tool container (Node 22, no npm install). It shares Caddy localhost and runs deterministic generation plus real API upload/read-back; `--verify-only` checks existing content. The stable local Compose project is `verfassung`; all nine API health endpoints must respond before startup succeeds.

Compose services: `edge-proxy`, `gateway-web`, nine `*-service`, nine `*-db` (`postgres:16`), `backup-service`.

## Caddy (`infra/caddy/Caddyfile`)

| Path | Upstream |
| --- | --- |
| `/api/docs/<svc>*` | `<svc>:8080` + strip prefix + `X-Forwarded-Prefix` |
| `/api/catalog\|content\|amendment\|identity\|editor\|search\|ingestion\|audit\|document*` | matching service, strip `/api/<svc>` |
| everything else | `gateway-web:3000` |

Docs: `http://localhost/api/docs/<svc>/swagger-ui/index.html` when `CADDY_EXPOSE_API_DOCS=true` (local-stack/ci). Other profiles 404 that path.

## Gradle

Root `settings.gradle.kts` is **not** a multi-module build (wrapper only). Each `services/<name>/` is its own project; `gradlew` delegates to repo wrapper **9.8.2**.

```
cd services/<name> && ./gradlew test
./gradlew -p services/<name> check    # tests + Spotless
```

Shared: `gradle/service-conventions.gradle`. New service: copy sibling (`.agents/skills/new-kotlin-service`) and add Compose DB, Caddy route, `BUILD_ORDER` in `manageLocalStack.sh`.

## CI (`.github/workflows/ci.yml`)

Runs on pull requests and pushes to `main`. Feature-branch pushes are checked by
their pull request run, avoiding duplicate full-stack builds for the same commit.
All host jobs use Ubuntu 24.04; the visual suite also pins its Playwright container.

1. Discover `services/*/build.gradle.kts` → matrix `./gradlew check`
2. `apps/gateway-web`: `npm test`, `typecheck`, `lint`, `build`
3. Playwright e2e (mock API)
4. Image builds (host bootJar + `docker build`)
5. `publish-journey`: Compose identity+catalog+content+editor (CI-6) and `scripts/publish_journey.py`
6. `full-stack-service-artifacts` builds the service jars; `full-stack-e2e` downloads them, starts Compose, uploads API fixtures, and runs real browser journeys
7. `ci-status` requires every job to succeed; failed jobs upload short-lived diagnostics where available

Dependabot: `.github/dependabot.yml`.

Full-stack CI also runs `scripts/operations/recovery_drill.py` against only its
disposable seeded project, including checksum/SQL-failure recovery and Search
outage detection. `scripts/operations/check.py` supplies read-only operational
checks; see `docs/operations/recovery-and-monitoring.md`. Audit runtime credentials
are separate from Flyway owner credentials in canonical and generated Compose.

## Code coverage

Every CI run publishes whole-repository and new-code line coverage. New or changed executable production lines require at least 80%; overall coverage is informational. `coverage` merges JVM execution probes and source-mapped JS/Python inputs, rejects stale/incomplete artifacts, and is required by `ci-status`. Shared JVM setup: `gradle/coverage-conventions.gradle`. Aggregation and regression tests: `scripts/code_coverage/`. Policy and reproduction: `docs/wiki/Technical-Development.md` and `docs/design/sprint-67-ci-code-coverage.md`. Browser acceptance checks remain separate.

## Gateway scripts (`apps/gateway-web/package.json`)

`npm run dev` (port 3000), `lint`, `typecheck`, `build`, `test`, `test:e2e`.

Host tools for the local stack: OrbStack or Docker Desktop, Bash, curl. JDK 21 and Node 22 are optional for host checks. See `README.md`.

## Local host verification

Testcontainers needs the active engine socket when `/var/run/docker.sock` is absent.
Set `DOCKER_HOST` to `docker context inspect --format '{{.Endpoints.docker.Host}}'`;
for OrbStack, `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock` identifies
the socket inside helper containers. These are local shell settings, not committed
application configuration. Keep service checks/builds serial.
