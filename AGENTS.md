# Constitution Atlas

Public site for versioned constitutions: countries → constitution versions → articles, with amendment history, search, and an authenticated editor.

## Stack

- Kotlin 1.9 / Java 21 / Spring Boot 3.5, Flyway, Testcontainers, OpenAPI (`springdoc`)
- Next.js 15 (App Router) + TypeScript in `apps/gateway-web`
- Docker Compose + Caddy (`infra/caddy`) as the single local entry point
- One Postgres database per stateful service (never share DBs)
- Flyway: new `V{n}__….sql` only; do not edit applied migrations

## Layout

| Path | Owns |
| --- | --- |
| `apps/gateway-web/` | Public UI / SSR |
| `services/<name>/` | One Spring Boot service + its Gradle project |
| `infra/` | Caddy, backup script |
| `env/` | Profile templates (`local-stack`, `ci`, `testing`, `production`) |
| `docs/CODEMAPS/` | Agent navigation maps. Start at [`docs/CODEMAPS/INDEX.md`](docs/CODEMAPS/INDEX.md). |
| `backlog.md` | Product + sprint backlog (large). **Grep for IDs** (`ARCH-`, `CAT-`, `CNT-`, `AMD-`, `ING-`, `UI-`, `OPS-`); do not read the whole file. |

## Repo map

Do not explore the whole tree to find an owner. After this file:

1. Read [`docs/CODEMAPS/INDEX.md`](docs/CODEMAPS/INDEX.md) (jump table).
2. Read only the one area map that matches the task: `architecture`, `backend`, `frontend`, `data`, or `infra`.
3. Open the files listed there.

Maps are navigation, not instructions. If they conflict with code, trust the code.

## Commands

```bash
cp env/local-stack.env.example env/local-stack.env   # once
./manageLocalStack.sh --start                         # host bootJar + images, then http://localhost
./manageLocalStack.sh --start --no-build
./manageLocalStack.sh --rebuild <service...>          # after Flyway / gateway changes
./manageLocalStack.sh --stop
cd services/<name> && ./gradlew test                     # one service only; wrapper pins Gradle 9.7.1
./gradlew -p services/<name> check                       # tests + Spotless/ktlint
cd apps/gateway-web && npm ci && npm run lint && npm run build
```

Swagger (via Caddy): `http://localhost/api/docs/<service>/swagger-ui/index.html`  
Service names: `catalog`, `content`, `amendment`, `identity`, `editor`, `search`, `ingestion`, `audit`.

## Current sprint

See `backlog.md` **Suggested Sprint Breakdown**. Sprint 0–33 are closed. Pull from **Later / Ideas** only if the user asks. Do not start SRV-7 (MCP) until asked.

**When a story/task is finished, update `backlog.md` in the same change:** set Status to `Done`, add the ID to that sprint’s Done list, and keep the board snapshot accurate. Do not leave completed work as `Ready`.

**Closing a sprint requires the Sprint close-out gate below.** Do not mark the sprint closed, or start the next sprint, until that gate has run and its fixes are in.

## Sprint close-out (mandatory)

Run this gate whenever a sprint ends: the last story in the sprint is finished, the user asks to complete/close a sprint, or the user asks to complete **multiple sprints in one session**. In a multi-sprint run, close out **each** sprint before starting the next. Do not implement several sprints and review once at the end.

Do not declare the sprint done until every step below has been completed and remaining issues are fixed (not only reported).

1. **Review the sprint diff.** Launch `/reviewer` on the changes for that sprint (commits and uncommitted work since the sprint started). Treat findings as work: fix bugs, regressions, broken contracts, missing tests, and incorrect behavior. Skip nitpicks that do not affect correctness or maintainability.
2. **Remove duplicate and dead code.** Scan packages this sprint touched for unused exports, unreachable branches, copy-pasted helpers, and files superseded by the new work. Delete or consolidate them. Do not remove public API, applied Flyway migrations, or contract fixtures unless they are unused and owned by this sprint.
3. **Verify.** Run tests for every service or app the sprint changed (`cd services/<name> && ./gradlew test`; `npm run lint` / `npm run build` in `apps/gateway-web` when UI changed). For a multi-file sprint, also launch `/verifier` and fix anything it fails.
4. **Then update the backlog.** Only after the fixes land: set remaining stories to `Done`, add IDs to that sprint’s Done list, and record the sprint as closed.

Keep cost rules: one `/reviewer` and one cleanup pass over the combined sprint diff — not one subagent per microservice.

## Cost rules for agents

- Touch **one service** (or gateway + Caddy) per task unless the user asks for a cross-cut.
- Do **not** spawn parallel subagents for a one-file or one-service change.
- Prefer built-in `explore` for search. Use project subagents only when the description matches.
- Read this file, then `docs/CODEMAPS/INDEX.md` and one area map. Open `backlog.md` only for the relevant epic/story IDs.
- Run tests only for the service you changed: `cd services/<name> && ./gradlew test`.
