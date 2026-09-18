# Constitution Atlas

Public constitution site: countries → versions → articles, amendments, search, and authenticated editing. Kotlin 1.9 / Java 21 / Spring Boot 3.5 services; Next.js 15 gateway; Docker Compose + Caddy. Each stateful service owns its Postgres database. Add Flyway migrations; never edit applied ones.

## Navigate and scope

Read [`docs/CODEMAPS/INDEX.md`](docs/CODEMAPS/INDEX.md), then the relevant area map and listed files. Trust code over maps. Work in one service (or gateway + Caddy) unless the task is cross-cutting. Do not start SRV-7 (MCP) unless asked.

Linear is the source of truth for tracked work: find the issue before starting, use its identifier in progress reports, and complete it after verification. `backlog.md` is historical; grep an ID when needed, never use it as a status board. Do not create issues for untracked maintenance. If Linear is unavailable, report the issue ID and status to the user. Two-axis versioning: [`ADR 0005`](docs/adr/0005-two-axis-versions.md) and [`design`](docs/design/two-axis-versions.md).

## Verify

- Changed service: `cd services/<name> && ./gradlew test` (`./gradlew check` also runs formatting checks).
- Changed gateway: `cd apps/gateway-web && npm run lint && npm run build`.
- Local stack: `cp env/local-stack.env.example env/local-stack.env` once; `./manageLocalStack.sh --start|--stop|--rebuild <service...>`.

## Sprint workflow

When asked to start a sprint, find its name, scope, and issues in Linear. Create a branch from the repository's default branch named `codex/sprint-<slug>`, where `<slug>` is the sprint name lowercased, with non-alphanumeric runs replaced by hyphens and leading/trailing hyphens removed. Use an isolated worktree if the current checkout has unrelated changes; never overwrite them. Use the same branch for all sprint work. After the first commit, push the branch to `origin` with upstream tracking and open a draft PR against the default branch titled with the sprint name. Commit and push completed sprint work to `origin` as it proceeds. If a matching branch or PR already exists, resume it rather than creating a duplicate.

Treat a request to do a sprint as authorization to carry it through completion. Keep working across issues and correction cycles; do not stop at a plan, partial implementation, open PR, or passing tests. If an external blocker prevents completion, report the exact blocker and resume when it clears. When the last story finishes, the user asks to close the sprint, or multiple sprints are requested, run this close-out for **each sprint before starting the next**:

1. Scan touched packages once for duplicate, dead, or superseded code; remove it without deleting public API, applied migrations, or contract fixtures still in use.
2. Run the distinct `reviewer` and `verifier` subagents defined in `.codex/agents/` independently on the combined sprint diff (commits and uncommitted changes). Have `reviewer` inspect correctness, contracts, regressions, and maintainability; have `verifier` check behavior and run focused tests. Fix actionable findings, then ask both agents to recheck the corrections. Repeat until neither reports a blocker.
3. Test every changed service/app using the commands above. Commit and push the final reviewed changes to `origin`, wait for required PR checks, and resolve any failures or review blockers through the same correction loop.
4. Mark the PR ready and merge it using the repository's required method (squash if none is specified). Only after merge, complete remaining Linear issues and record sprint completion where applicable.

Do not declare the sprint done or start the next one before merge and Linear updates. The two-agent review applies to sprint close-out even for a one-service sprint; otherwise avoid subagents for one-file or one-service changes. Do not merge while required checks or either agent's blockers remain unresolved.
