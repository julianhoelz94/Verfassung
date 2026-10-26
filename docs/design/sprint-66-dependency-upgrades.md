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

Pending. Record exact commits, commands, CI links and limitations here as each gate completes.
