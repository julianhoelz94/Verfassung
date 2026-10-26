# Sprint 66 — Coordinated dependency upgrades

Status: implementation in progress. This document records scope and verification; it is not a completion claim.

Tracker: Sprint 66 in Linear; [VER-192](https://linear.app/verfassung/issue/VER-192/dep-3-upgrade-checklist-test-one-service-then-ci) covers the repeatable upgrade checklist. Base: `61ef2f2bb4af92da94c7d3b44f66856f382fbf62`.

## Scope

- SHA-pinned checkout v7 across CI, deployment and Wiki workflows. Wiki jobs start from trusted main, verify the merged SHA is an ancestor, then select that exact revision. Fork checkout protections remain enabled.
- Spotless 8.10.4 with ktlint 1.3.1 retained, coordinated Kotlin 2.4.21 plugins and runtime across all service builds.
- Spring Boot 4.1.2, Springdoc 3.2.0 and compatible Jackson, Flyway and Testcontainers integration. Preserve JSON limits, error/serialization contracts, authentication and immutable publication.
- React 19.3.1 with matching types; Next 16.4.3 with matching ESLint configuration and migration fixes.
- TypeScript 7.0.2 for MCP only, with compilation, protocol tests and container validation.
- Dependabot groups for coupled dependencies and current dependency/upgrade documentation.

Java 21, Node 22, Gradle 9.8.2 and Ubuntu 24.04 remain the baseline. Gateway TypeScript 7, Node 26 and Java 25 are deferred. Obsolete Java 24 proposals are skipped. Original bot PRs are closed as superseded only after their changes are delivered.

## Verification gates

1. Validate build tooling and one service before broad backend migration; preserve every applied database migration.
2. Run every changed service's `./gradlew check`; gateway tests, lint, typecheck and production build; MCP tests and production image build.
3. Scan touched packages for duplicate/dead code. Independently review and verify the combined sprint diff, correcting and rechecking all blockers.
4. Require fresh full PR CI, including visual, publication, image and full-stack journeys. Squash merge only after the exact final head clears review and verification.
5. Verify the merged Wiki workflow, published guide sources and editorial clips; then complete VER-192 and the sprint milestone.

## Evidence

- Initial checkout/workflow commit: `b4d7adf`; draft PR [#205](https://github.com/julianhoelz94/Verfassung/pull/205).
- Kotlin 2.4.21 / Spotless 8.10.4 platform check passed under Gradle 9.8.2 before Boot migration. ktlint remains 1.3.1.
- MCP: `npm test` passed 33 tests under Node 22.23.4 with TypeScript 7.0.2 and Node types 22.20.5. Production npm audit reports zero vulnerabilities. The unchanged Node 22 Alpine Dockerfile builds with the native compiler; the resulting image serves `/mcp/ping` with 200 and rejects unauthenticated `/mcp` with 401 plus the discovery challenge. Disposable smoke container removed.
- Preliminary independent infrastructure/MCP review reported no blockers. This does not replace final combined sprint review.
- React 19 on Next 15 checkpoint: 423 Vitest + 13 Node tests, lint, typecheck and build passed. Next 16 implementation: 429 Vitest + 13 Node tests, lint/typecheck/build and 23 focused Chromium journeys passed. Final clean install and production build passed. Both npm audit scopes are clear with the normal Next dependency tree; legacy overrides removed.
- Boot 4 platform, Catalog and Ingestion checks passed before the final all-service run. Added JSON constraint, scalar coercion, wire-format and upload-isolation regression checks. Final all-service run is pending.
- Existing deployment safeguard suite: 42 tests passed; rendered Compose matches its checked-in definition. Workflow/Dependabot YAML parses and Wiki source checks pass.
- Final combined reviewer/verifier clearance, complete CI and published Wiki/media verification remain pending.
