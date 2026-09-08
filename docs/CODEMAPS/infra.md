<!-- Generated: 2026-09-06 | Files scanned: ~250 | Token estimate: ~700 -->
# Infra

**Rules:** `.cursor/rules/docker-infra.mdc`, `.cursor/skills/local-stack`  
**Pins:** `docs/dependencies.md`

## Local stack

```
./manageLocalStack.sh --start              # host bootJar + images + up
./manageLocalStack.sh --start --no-build
./manageLocalStack.sh --rebuild <compose-service...>
./manageLocalStack.sh --stop               # keep volumes
./manageLocalStack.sh --reset              # down -v
./manageLocalStack.sh --reset --prune      # also docker system prune -af
```

Env: copy `env/local-stack.env.example` → `env/local-stack.env` (gitignored). Profiles: `local-stack`, `ci`, `testing`, `production`.

Kotlin images: host `./gradlew bootJar` then `COPY app.jar` onto `eclipse-temurin:21-jre` (`services/*/Dockerfile`). Gateway (`node:20-alpine`) and Caddy still build in Docker.

Compose services: `edge-proxy`, `gateway-web`, eight `*-service`, eight `*-db` (`postgres:16`), `backup-service`.

## Caddy (`infra/caddy/Caddyfile`)

| Path | Upstream |
| --- | --- |
| `/api/docs/<svc>*` | `<svc>:8080` + strip prefix + `X-Forwarded-Prefix` |
| `/api/catalog\|content\|amendment\|identity\|editor\|search\|ingestion\|audit*` | matching service, strip `/api/<svc>` |
| everything else | `gateway-web:3000` |

Docs: `http://localhost/api/docs/<svc>/swagger-ui/index.html` when `CADDY_EXPOSE_API_DOCS=true` (local-stack/ci). Other profiles 404 that path.

## Gradle

Root `settings.gradle.kts` is **not** a multi-module build (wrapper only). Each `services/<name>/` is its own project; `gradlew` delegates to repo wrapper **9.7.1**.

```
cd services/<name> && ./gradlew test
./gradlew -p services/<name> check    # tests + Spotless
```

Shared: `gradle/service-conventions.gradle`. New service: copy sibling (`.cursor/skills/new-kotlin-service`) and add Compose DB, Caddy route, `BUILD_ORDER` in `manageLocalStack.sh`.

## CI (`.github/workflows/ci.yml`)

1. Discover `services/*/build.gradle.kts` → matrix `./gradlew check`
2. `apps/gateway-web`: `npm test`, `lint`, `build`
3. Playwright e2e (mock API)
4. Image builds (host bootJar + `docker build`)
5. `publish-journey`: Compose identity+catalog+content+editor (CI-6) and `scripts/publish_journey.py`

Dependabot: `.github/dependabot.yml`.

## Gateway scripts (`apps/gateway-web/package.json`)

`npm run dev` (port 3000), `lint`, `build`, `test`, `test:e2e`.

Host tools (not in Compose): Docker Desktop, JDK 21, Node 20. See `README.md`.
