# Repository review — 23 October 2026

## Scope and assessment

Baseline: `f47757a1638a324400ca665178ec1c08c9618975` (Sprint 63).
The starting inventory contains 1,166 tracked files and 583 Kotlin, TypeScript,
JavaScript, Python and shell files, 63,815 lines including tests.
Work used a fresh isolated checkout because the supplied checkout was older and
several filesystem reads stalled. No unrelated working files were replaced.
Linear searches found no active issue matching this general maintenance request;
no maintenance issue or new sprint was created.

The code has sound foundations: service-owned databases, parameterized SQL,
immutable published content, explicit role checks, bounded HTTP calls, shared
platform contracts, and substantial API/browser coverage. It was not functioning
correctly in every reviewed path. This pass corrects reproducible contract,
concurrency, data-loss, security and operational defects, rather than equating a
successful build with complete product acceptance.

Production Kotlin review covered all 203 source files in platform and the nine
services. Gateway/MCP review covered route/client inventories and concentrated
manual review on authentication, editing, readers, comparison, transport and
resource bounds. Infrastructure review covered Compose/Docker, Caddy, CI,
local-stack scripts, backups and documentation generation. Historical migrations,
fixtures and visual baselines were assessed as contracts; they were not all
manually re-proven. No static review or finite test suite proves every possible
runtime behavior, concurrent interleaving or deployment configuration.

## Corrections

| Area | Defect and resulting behavior | Regression evidence |
| --- | --- | --- |
| Editor publication | The client fetched only Content's first 200 roots. It now reads all pages, authorizes each request, and fails if a response ends before the advertised total, preventing truncated successors. | `RestContentClientTest`: 205 roots with/without total headers; incomplete-source rejection |
| Published permalinks | Catalog/Content hid retired published editorial snapshots; Document hid citations attached to staff-listed corrections. Direct access now depends on publication state; draft access and public collection discovery stay restricted. | Catalog/Content API tests and `RestLinkTargetClientTest`: retired/current/draft snapshots, pinned reader settings, public list shape |
| Editorial transitions | Plain saves, publication details, review and approval read state without the session lock used by structured saves/publication. All acquire the same row lock before reading state. Waiting commands reject stale transitions instead of modifying already-reviewed data. | `EditorApiTest.commandsRecheckSessionStateAfterWaitingForConcurrentTransition`: actual PostgreSQL blocking, four commands, unchanged content/comment/status |
| Content projections | Direct canonical articles and nested children reported position 1 regardless of location. Article/unit projections now share their mapper and preserve sibling positions. | `OrderedContentApiTest`: paginated roots, direct aliases and mixed child positions |
| Content export | Node and text split/merge lineage was lost on export. Both are retained; Ingestion admits ancestry only with a pinned predecessor, and Content validates exact source membership. Stored revision reuse remains forbidden in imports. | Ordered content export tests; `ImportValidatorTest` pinned/unpinned ancestry and immutable-revision rejection |
| Content writes | Child entries silently discarded rich text fields. Invalid format/table/footnote/reference fields on child entries now reject the request transactionally. | `OrderedContentApiTest`: all four malformed forms and rollback |
| Amendment removal | Removed units lacked their source node, losing exact before references during suggestions/automatic linking. Removal references now survive linking and publication. | `OrderedAmendmentDiffTest`, API suggest → link → publish regression |
| Amendment forms | Malformed changes/documents JSON silently became empty lists and could overwrite saved data. Parsing fails with a recoverable form error; restore uses the same parser and preserves pending logical targets. | `amendment-form.test.ts` malformed/intentional-empty/restore cases |
| Draft publication UI | Saved pending target selections could appear empty after reload, and converting a row to removed could discard it or retain an invalid after target. Shared normalization preserves drafts and clears only the inapplicable target side. | `PublishForm.test.tsx`, `publish-details.test.ts` |
| Redirects | A same-origin path such as `/safe/..//evil.example` normalized into a scheme-relative redirect. The normalized pathname is now checked before returning it. | `return-to.test.ts`, including encoded dot segments |
| Comparison | Token merging inserted spaces around stored tabs/newlines; an unbounded quadratic matrix could exhaust memory for large text replacements. Diffs preserve exact text and cap detailed comparison work, retaining unchanged context and complete coarse replacement text. | `text-diff.test.ts`: whitespace reconstruction and large/small edits in long text |
| Catalog settings | Impact analysis forwarded the caller's credentials to Editor but omitted them for Content, causing authenticated draft inspection to fail. Both calls now retain authorization. | HTTP-backed `SettingsUsageClientTest` |
| Import setup | Confirmation could claim a proposal after a revision won, yet send its stale pre-claim payload to Catalog. Atomic `UPDATE … RETURNING` freezes and returns the exact confirmed payload. | Deterministic API regression with a revision between read and claim |
| Import progress | Upload status queried chunk indexes once per expected chunk (up to 50 identical queries). It now reads the set once. | `ImportUploadStatusTest`: maximum-size upload and one query |
| MCP authentication | The limiter cleaned expired clients but never bounded live entries. A dedicated limiter caps tracked clients, preserves existing quotas, and rejects unknown clients at capacity until expiry. | `auth-rate-limit.test.ts`: quota, capacity, expiry/reclamation |
| Backups | A failed final `pg_dump` could leave nine nonempty files that passed restore preflight; a same-second run overwrote files; retention deleted arbitrary old directories. Incomplete runs retain a marker, restore rejects them, timestamp collisions fail, and retention only removes completed timestamp directories. | `test_backup_restore.py`: partial final dump, incomplete restore, collision, permissions and retention isolation |

## Duplication and maintainability

Removed duplicate canonical article projections, four identical change-tone
helpers, an identical amendment branch, a no-op catch/rethrow, duplicated amendment
restore parsing, and repeated setup-proposal row mapping. Extracted shared draft
change normalization and the MCP limiter where they provide one testable policy.
The existing exact-Kotlin-copy hygiene check passes. This is a narrow check, not a
claim that no semantic duplication exists.

Removed `scripts/add_local_stack_host.sh`: it had no callers or documentation
references and configured a hostname rejected by current local TLS policy. Current
local setup uses localhost. Applied migrations, public DTOs, compatibility aliases,
contract fixtures, generated fixture inputs and visual baselines remain required.

Dependency update monitoring previously omitted Document, platform, MCP and the
local build image. Dependabot now covers those manifests. The gateway audit also
identified vulnerable dependencies: Next.js and its lint config move to 15.5.28,
with patched Sharp, targeted compatible PostCSS/source-map-js overrides, and
Playwright 1.55.1 plus its matching visual CI image. The Next.js upgrade addresses
the upstream [image-optimization advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw),
among other patched issues; this does not assert exploitation in this deployment.
The gateway's end-of-life Node 20 runtime and CI settings move to supported Node 22,
matching MCP ([Node release status](https://nodejs.org/en/about/previous-releases)).
Vitest moves from 2.1.9 to 4.1.12 with compatible Vite 7.3.7, removing the flagged
critical development-tool dependencies. All 273 Vitest cases pass without changing
their assertions or configuration. Compatible js-yaml and brace-expansion lock
updates remove additional development advisories.
CI now rejects high/critical production npm advisories for both JavaScript apps.
Deprecation warnings still exist in the Gradle/Spring testing stack and older
frontend lint tooling. The dependency inventory explains when to remove overrides.

The architecture and traversal ADRs document invariants well. Some operational
maps had drifted: import approval and publication are distinct actions, but one
suitably authorized account may perform both. Maps and MCP operations now match
the tested permission contract. Backup documentation describes incomplete runs,
legacy-backup limits, consistent project selection and cross-service snapshots.

Large files are not automatically defects. Several functions do combine too many
responsibilities to understand easily:

- `EditorService.publish` is roughly 240 lines of remote writes, reservation and
  retry semantics. Extracting its phases safely needs fault-injection tests at
  each remote boundary; changing transaction boundaries by cosmetic splitting
  would be risky.
- `OrderedContentService.save` combines recursive validation and persistence;
  validated request types would make this boundary easier to reason about.
- `HierarchicalDiff.compare` and `StructuredDraftEngine.replay` contain substantial
  algorithm/operation dispatch logic. Invariant/property tests should precede a
  larger algorithm refactor.
- `AuthService`, `IdentityRepository`, `CatalogRepository`, outline validation and
  import validation are responsibility hotspots. Keep owner-specific permission
  checks and DTOs separate even when fields look similar.

The targeted extractions in this pass reduce repeated policy and branching. They
do not disguise the remaining complexity by simply moving it into more files.

## Remaining limits and follow-up boundaries

- Production npm audits are clear, but the full gateway audit reports five high
  package entries from the single development-only Next ESLint/fast-glob/
  micromatch/braces chain. The underlying
  [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) has no patched
  release at review time. Lint patterns are repository-controlled, and these
  packages are pruned from the production image. No incompatible lint downgrade
  was applied to silence the audit.
- Jurisdiction hierarchy is available in Catalog. Website readers, search and
  ingestion still use country APIs, as already documented in Technical
  Architecture. Historical/uncoded/local jurisdictions need a coordinated reader,
  search result/facet and import-destination implementation. Indexing them alone
  would produce broken country-based links. This pass does not claim that feature
  is complete.
- Identity audit appends are best-effort HTTP. An Audit outage can lose events;
  durable delivery needs an Identity-owned outbox and recovery acceptance tests.
- MCP's authentication limiter bounds failed-response state, but bearer-token
  validation still calls Identity before returning a throttled failure. Separate
  concurrency limits bound in-flight calls; a request-rate bound on Identity work
  would need a defined policy for valid tokens sharing a blocked client IP.
- Process termination during Ingestion `preparing` or setup `confirming` can leave
  claims stranded. Recovery must reconcile potentially-created Catalog resources
  before retrying writes. Exception handling alone does not cover process death.
- Recursive Content loading and Audit append/history reads have potential N+1 or
  unbounded-history costs. No production workload measurements were taken.
- Search result/count/generation reads are consistent, but its three facet queries
  are separate snapshots during a concurrent rebuild. This was noted during
  static review; no user-visible failure was reproduced in this pass.
- Backup dumps are nine independent database snapshots. The marker prevents
  restoring a failed new run; it does not certify old backups, validate SQL,
  synchronize live cross-service writes, or make restore atomic.
- No production rollout, load test or recovery drill against real user data was
  performed. Local integration tests use isolated disposable databases.

## Verification

| Evidence | Result |
| --- | --- |
| Platform and all nine Kotlin services: `check` | 339 tests passed, zero failures/errors/skips; includes formatting checks and isolated PostgreSQL API/concurrency tests |
| Gateway on Node 22.23.4 | 273 Vitest tests in 46 files plus 9 Node tests passed; lint, type checking and Next.js 15.5.28 production build passed |
| Gateway clean dependency install | Final lockfile installs unchanged with Node 22.19.0 / npm 10.9.3 in the Linux AMD64 Playwright CI image; no alternate installer is required |
| MCP | 30 tests and TypeScript build passed |
| npm production dependency audit | Zero findings for gateway and MCP; the development-only lint advisory is documented above |
| Backup and local-stack orchestration | 16 Python tests passed; shell syntax checks passed |
| Caddy transport | 8 unit tests passed; actual Caddy configuration adaptation and policy assertions passed in all four modes |
| Repository and documentation | Hygiene, Wiki references (16 pages/18 illustrations), and whitespace checks passed |
| Independent algorithm probes | 10,000 deterministic whitespace/Unicode diff pairs reconstructed both inputs; 100,000 limiter operations matched a reference model; large one-sided comparisons and redirect normalization passed |

Backend checks ran serially with Java 21 and disposable Testcontainers databases.
Editor test teardown logged scheduler connection warnings after its database
closed; every test and the full Gradle check still passed.

Distinct reviewer and verifier agents inspected the combined source diff and
rechecked corrections. The reviewer caught the export/import ancestry mismatch;
the verifier caught excessive allocation for one-sided text diffs. Both were fixed
and covered by regressions. Neither found a remaining source blocker.

Browser and stack acceptance are separate from the unit/API results above. The
PR's `e2e`, `visual-e2e`, `publish-journey` and `full-stack-e2e` checks record their
results against the proposed commit. Review their actual outcomes before merging;
the dependency/browser upgrades also require the existing Linux screenshot
baselines to pass. No screenshots were regenerated merely to bypass failures.
Neither local checks nor CI certify a production rollout or real-data recovery.
