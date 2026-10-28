# Dependency upgrade checklist

Owner: the maintainer reviewing the dependency PR. Review Dependabot's weekly queue and security alerts; the [dependency inventory](dependencies.md) records the accepted runtime/build/image baseline. A successful version resolution is only the first gate.

## Select a coherent change

1. Read the actual diff, current base, upstream migration notes and support policy. Prefer patched stable releases; do not select prereleases or an unsupported runtime just because a bot proposed it.
2. Keep related versions together: Kotlin JVM/Spring plugins and runtime; Boot plugins and the platform BOM, Springdoc, Jackson and test dependencies; React/DOM and both type packages; Next and its lint config. Runtime and type declarations must agree.
3. Separate runtime upgrades from framework migrations where possible. Java toolchains, CI and every affected Dockerfile must agree; the same applies to Node and `@types/node`. Review both build and runtime image stages.
4. Use an isolated branch from current main. Preserve unrelated work. Record replaced bot PRs, exact old/new versions, compatibility decisions and rollback scope in the PR. Close superseded PRs only after delivery.

Dependabot groups coupled packages across service directories. Groups reduce conflicting proposals; they do not prove compatible major releases and do not authorize automatic merging. A Node image PR still needs review of CI and npm types; a Java image PR still needs review of Gradle toolchains.

## Prove one consumer, then the complete change

Start with platform and one representative service under the selected Gradle/JDK pair. Run `./gradlew -p services/<name> check`, then each changed service serially. Include Testcontainers integration tests and inspect test counts; skipped database tests do not prove a migration.

For framework changes, verify timestamp/null/default JSON, malformed input, bounded JSON parsing, import/export round trips and idempotency, API error/status contracts, authentication and immutable publication. Preserve every applied Flyway migration and service-owned database. Keep library-specific Jackson 2 dependencies if an integration still requires them; do not globally exclude them.

For the gateway, run `npm ci`, `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` under the production Node major. Test changed browser journeys and inspect screenshot differences. For MCP, run `npm ci` and `npm test`, then build its production container; TypeScript's native compiler must be present for the target build architecture and libc. Review production npm audits and explain any residual development-only findings instead of applying incompatible audit fixes.

## Review, merge and publish

Require the repository's complete PR CI on the final head, including service checks, images, mock/visual browsers, publication and full-stack journeys. For sprint delivery, independent reviewer and verifier agents must clear the combined diff and all corrections. Do not bypass checks or dismiss unresolved blockers.

Squash merge the reviewed head, verify the resulting commit and close the bot PRs whose changes were delivered. Update the inventory and affected Wiki sources. Wait for the merged Wiki workflow and verify the published pages and English/German editorial clips before marking the sprint complete in Linear.

If the update fails, keep the branch and record the exact compatibility or infrastructure blocker. Roll back a merged dependency regression through a reviewed revert; do not rewrite applied migrations or discard user data. Application deployment remains a separate authorized workflow.
