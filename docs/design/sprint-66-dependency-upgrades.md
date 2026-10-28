# Sprint 66 — Coordinated dependency upgrades

Status: implementation and local verification complete. Required CI, merge and published Wiki/media close-out are tracked in Linear; this document records the review candidate.

Tracker: Sprint 66 in Linear; [VER-192](https://linear.app/verfassung/issue/VER-192/dep-3-upgrade-checklist-test-one-service-then-ci) covers the repeatable upgrade checklist. Initial base: `61ef2f2bb4af92da94c7d3b44f66856f382fbf62`. Main was merged again through `922089235becff0fae59f74f153ab245334e5556` during verification, preserving the intervening import, coverage and recovery work.

On resumption, main was integrated through `5c359b1511b7769c14c1c57dd827377ca54a888a`, preserving source-information editing, published-release deployment safeguards and the country-label spacing fix. Imported mapper/test references were adapted to Jackson 3 and React 19. Publication retry regressions now seed pre-update Editor and Catalog hashes, retain hashes written after source review was added, and require Catalog to validate the complete payload even when a successor is already reserved. An omitted source override remains compatible only when it exactly matches evidence inherited from the published predecessor. No applied migrations were changed.

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
- The first complete backend run passed all 10 projects with 380 tests and no failures/errors/skips, before the last main merge. The interrupted Identity run was caused by exhausted disk and a corrupted generated test-result cache; preserving/removing that cache restored the normal test run without raising the JVM heap.
- Actual pre-upgrade DTOs were compiled and serialized with Boot 3.5.16/Jackson 2.21.4. Legacy and ordered fixture bytes/hashes are checked in; Boot 4 integration tests passed both exact serialization and retries against preseeded persisted old checksums. The same fixture bytes were confirmed with Kotlin runtimes 1.9.24 and 1.9.25. Nine service mappers and the separate HTTP-client converter retain their respective legacy defaults.
- Main merges: `130b25a` includes coverage/import changes through `36371db`; `4f037b6` includes recovery/audit/reader changes through `9220892`. The new coverage gate remains enabled. Reviewer found the renamed proxy missing from coverage inventory; `efe2b98` fixes it, with 24 tooling tests and actual collected-source completeness verified independently.
- Final combined reviewer/verifier clearance, verification after the last main merge, complete CI and published Wiki/media verification remain pending.

## Final local candidate

After integrating main through `9220892`, all ten backend projects pass `check` and `jacocoTestReport`: 417 tests, no failures/errors/skips (Platform 10, Identity 84, Catalog 57, Editor 47, Content 43, Amendment 63, Document 23, Ingestion 67, Search 13, Audit 10). Both platform and Catalog resolve Kotlin stdlib/reflect to 2.4.21. Applied migrations exactly match main.

The gateway passes 456 Vitest and 13 Node tests, coverage collection, typecheck, lint, production build and 11 independent reader/search/setup browser journeys. MCP's 33 tests and native compiler source-map coverage pass. Production and full npm audits report zero vulnerabilities for both projects. The final gateway lock restores all native optional platform entries without changing any already tested dependency version; the earlier macOS-generated lock omitted Linux Rollup.

Independent verification also passes 66 focused backend tests spanning JSON constraints/defaults, old-checksum retries, upload limits, password/security audit behavior, durable audit delivery and the restricted Audit database runtime role. Frozen full-suite reports remain unchanged. Coverage tooling, deployment safeguards, Wiki references and repository hygiene pass. The new 80 percent changed-code coverage gate remains required in CI.

Independent source review cleared the combined migration, including the corrected proxy coverage inventory and both main-merge conflict resolutions. Final commit binding, required CI and published Wiki/video evidence are recorded in the PR and Linear completion note after their gates finish.

The coverage follow-up adds behavior regressions for exact migration dependency/document/amendment pins, immutable input trees, malformed IDs and prepared-job reuse; linked-content tests protect current/published pins and exact Wiki image revision identity. Cookie tests exercise SSR hydration, persisted dismissal/remount/reopening, cross-tab subscription cleanup and unavailable storage. These additions cover the measured gaps without changing production logic, exclusions or the 80 percent requirement. The exact merged-probe gate result is part of final PR/Linear evidence.
