# Sprint 60 code review

Approved full-repository review and cleanup, started after Sprint 59 and its
post-merge CI/Wiki close-out. Product behavior, service ownership and published
contracts remain the constraints for refactoring.

## Baseline and method

Initial base: `5232c4277a50922af56b55816ce7b7319be09d3d`. Before final CI, integrate
`c089860` (the concurrent Wiki player/footer fix) without changing its behavior.
The initial inventory contains
1,128 tracked files and 548 Kotlin, TypeScript, JavaScript, Python and shell files
(59,710 lines). Inventory and source/duplicate/reference scans cover the repository;
manual review concentrates on ownership, authorization, immutable publication,
concurrency, transport, error handling and operational failure paths in each area.
Tests, migrations, fixtures and media are assessed as contracts/evidence, rather
than reformatted or deleted merely to reduce counts.

Linear tracks the approved scope in the Sprint 60 milestone and linked plan. Issue
creation was attempted but rejected by the workspace free issue limit. Existing
unrelated issues remain intact. Delivery PR: #139.

## Findings and corrections

| Finding | Correction and evidence |
| --- | --- |
| Recovery-code check/use was spread across three queries; concurrent callers could both authenticate | One owner-scoped conditional `UPDATE ... used_at IS NULL`; eight-way PostgreSQL concurrency test requires exactly one success and rejects replay |
| Setup filter caught application exceptions after admitting a request | Admission checks are isolated from the downstream chain; unit tests cover unchanged downstream exceptions, setup outage, denial, health and legal/admin exceptions |
| Nine copied HTTP factory files and another publication-specific transport | One platform builder; preserve 2 s connect / 5 s read defaults, fresh builders/interceptors, and the outbox's explicit 60 s deadline |
| Three identical structured JSON post-processors and a duplicate strict-write base | Explicit platform imports only in the original Content/Editor/Ingestion consumers; Content uses the shared strict-write base; API tests retain malformed/deep/rich-content coverage |
| Gateway requests could wait indefinitely; malformed response bodies escaped the recoverable outage state | Shared 10 s deadline retains Request/init cancellation and shorter caller limits (translation batches 30 s, file streaming 60 s); nullable/paginated reads and writes normalize unreadable JSON without retrying commands; unit tests cover cancellation, timeout, malformed/truncated bodies and empty reads |
| URL error-key checks accepted inherited object properties | Own-property lookup with English/German regression cases for `constructor`, `__proto__`, `toString` and unknown keys |
| Restore could replace early databases before finding a missing later dump | Preflight all nine regular, readable, nonempty dumps before the first schema replacement; fake-engine tests assert zero database commands for incomplete/empty backups and directories disguised as dumps |
| Backup/restore duplicated their database inventory and readiness loop | Shared sourced helper; restoration remains a sequence of database operations, not a distributed transaction |
| Nested ingestion credential scope discarded the parent's authorization | Restore the parent in `finally`; regression test covers nested failure and null credentials without leaking into the next request |
| Repeated version scans while filtering/sorting amendment intervals | Build one version-position lookup; existing compare tests verify legal ordering and exclusions |
| Repeated MCP read/write transport and unchecked error-detail shapes | One request path preserves credentials, idempotency and 8 s read / 30 s write deadlines; malformed upstream error bodies retain safe status/error mapping; all MCP tests run under unused-code compiler checks |
| Image signature/dimension parsing obscured document persistence and revision/link behavior | Extract the unchanged fail-closed image validator; API tests retain all supported image fixtures, invalid files and pinned-publication behavior |
| Dead helpers, props, imports, wrappers and an unchecked Map parser | Remove unreferenced gateway command/API helpers and props; parse conflict codes through typed JSON nodes; enable unused locals/parameters in both TypeScript projects and use the ESLint CLI without deprecated Next lint wrapping |
| Navigation/data maps described pre-review imports, schema and access rules | Refresh ownership, current immutable content, staged imports, setup, transport and verification documentation; remove machine-specific links |
| Post-merge Catalog tests exposed a random country-code collision with the reservation test's fixed `QZ` | Allocate generated test countries deterministically in a separate namespace and use the allocator for reservations; retain all publication/idempotency assertions |
| Wiki fixture verification exposed concurrent Search index replacements inserting the same document ID | Serialize each rebuild before loading its source snapshot; keep readers on the committed generation; PostgreSQL concurrency test requires one source load at a time and complete final replacement |

## Removed files and intentional retention

| Removed | Why safe |
| --- | --- |
| Nine service-local `TimedRestClients.kt` files | Call sites import the platform implementation; Audit's unused copy had no callers |
| Three service-local `config/JsonReadLimits.kt` files | The original three applications explicitly import the shared post-processor |
| Root `sprint-37.bundle` (3.7 MiB) | Historical Git transport backup; no runtime, build, script or documentation references; history remains in Git |
| Three unsuffixed `docs/wiki/media/*.webm` recordings | Superseded by six bilingual merged-PR recordings; guides use the current hosted player; existing raw Wiki links remain available |

Also remove unused amendment command functions, a form prop, four unused API
wrappers/their orphaned result type, an unused comparator and imports. Reference
checks include framework entry points and tests, not import counts alone.

Retain applied migrations, contract fixtures, generated API fixture inputs,
Linux visual baselines, referenced prototypes/design evidence, Gradle wrappers and
shared editor configuration. Domain-specific service DTOs/authorization policies
remain separate even where their fields are similar. Pure helpers exercised by
contract/algorithm tests are not removed solely for lacking a page import.

The dependency review found the gateway QR packages are used by browser fixtures
and decoder checks; they remain. No speculative dependency upgrades or new analysis
packages are needed. No cross-database writes or schema changes were introduced.

## Review coverage

| Area | Reviewed paths and outcome |
| --- | --- |
| Platform | Shared HTTP/identity/setup filters, ordered contracts/diffs, exceptions and logging; consolidated transport/JSON, corrected gate exception scope, documented identities |
| Catalog | Write/query authorization, legal/editorial chains, outline/settings pins, successor reservations, lifecycle/wiki ownership and repositories; shared client cleanup, current maps |
| Content | Ordered revisions, generation/receipt checks, snapshot member validation, legacy compatibility and strict writes; shared transport/JSON/base and invariant documentation |
| Amendment | Staff/public revision selection, mutation roles, version pins, review/diff contracts and repository constraints; shared transport, retain domain contracts |
| Editor | Owned sessions, pinned structured replay/publication, successor reservation, durable side effects and downstream clients; shared transport, typed error parsing and publication documentation |
| Identity/setup | Password/session/MFA/passkey flows, recovery ownership/use, bootstrap gates and saved/effective policy settings; atomic recovery fix and shared audit transport |
| Ingestion | Staging/review/publication separation, uploads/proposals, idempotency/outbox and request-thread auth; shared limits/transport, parent scope restoration |
| Search | Published traversal, index replacement/read transactions, pagination/generation and authorization; shared transport, retain derived-index semantics |
| Audit | Append-only event attribution, reader/appender scopes, repositories and health; remove unused local transport copy |
| Document/legal | Revision/file lifecycle, target/revision visibility, image bounds, inherited links and same-database legal/contact writes; extracted validator, shared client and link replay documentation |
| Gateway | Routes/shared components, clients/session/setup/rate checks, reader/compare identity, localization and form actions; bounded transport, error recovery, dead code/types and version lookup |
| MCP | Published-only tools, key scopes/resource, cursors, bounded transport/concurrency, import schema/staging and metrics; shared request path/error validation and stricter compiler |
| Tests/contracts/assets | Unit/API/browser suites, fixture upload/read-back, generated inputs and snapshots; preserve behavioral contracts, add targeted failure/concurrency regressions |
| Infrastructure/tooling | Compose/Docker/Caddy, TLS modes, local-stack locking/health, backup/restore, CI and media pipeline; restore preflight/shared helper and hygiene checks |
| Documentation | Ownership/navigation/data maps, ADR links, developer/backup/media guidance and Wiki sources; remove stale generated recordings and portable-link failures |

## Durable checks and verification

- `npm run typecheck` and production compilation reject unused locals/parameters.
- `scripts/check-repository-hygiene.py` rejects committed local/generated artifacts
  and exact Kotlin implementation copies after package/import/comment removal.
  This deliberately narrow guard does not claim to detect semantic duplication.
- CI runs hygiene, restore-preflight and Wiki-reference checks, plus existing
  backend, browser, image, transport, fixture and publication gates.
- Platform and all nine services pass `check`/tests and service `bootJar`: 302
  tests, zero failures, including the eight-way PostgreSQL recovery regression.
- Gateway: 9 Node tests and 211 Vitest tests pass; strict typecheck, direct ESLint
  with zero warnings and production build pass.
- MCP: build and all 27 tests pass. Python: four restore regressions, eight
  local-stack orchestration tests and eight Caddy unit tests pass.
- Hygiene, 16 Wiki pages/18 illustration references, diff whitespace and all four
  generated transport configurations pass. Real HTTP probes independently confirm
  response-body deadlines, caller/Request cancellation and no command retries.
- Independent reviewer and verifier cleared the combined diff and correction
  passes. The reviewer caught the non-regular-dump edge case; both rechecked its
  correction and the remaining gateway transport/pagination improvements.
- Final production-build browser run: 73 journeys pass; the Linux visual snapshot
  test runs in its pinned CI image. Required PR/push full-stack and visual CI passed.

## Delivery evidence

PR #139 merged as `bf2c41f16e19051483e232544dd05e1f48250156` after both independent
reviews and required PR/push CI passed. Post-merge main CI exposed the Catalog
test-data collision above; its correction is part of Sprint 60 close-out. Main CI
and published Wiki page/video verification remain required before completion.

The user subsequently requested a deeper Identity security review before closing
Sprint 60. Its confirmed attack paths, corrections and evidence are recorded in
[the security review](sprint-60-identity-security.md). This remains part of the same
sprint and branch; its required review/CI/publication gates also precede completion.
