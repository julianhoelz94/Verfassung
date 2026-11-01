# Cognitive complexity cleanup estimate

## Current target and pilot

The agreed maximum is **20 per function** and **100 per Kotlin file**.
All editor code is back in scope as of 2026-10-30; there are no construction
exemptions. The earlier editor deferrals described in the package history below
have ended. Batch 1 now brings the editor page, command route, publishing and
structured replay under the limits, removing their cleanup baseline entries.
All editor changes follow the same normal gates as other code.

The original assessment below used a target of 15 and remains a historical
comparison, not the active cleanup scope. The current inventory follows Batches 2–4 below.

The pilot starts from fetched `main` revision `bee7b4b` (2026-10-28), including
Kotlin 2.4 / Spring Boot 4.1, Next.js 16 / React 19, and the specification-derived
behavioral tests. The CI branch was rebased onto that revision before cleanup.

Two bounded responsibilities were selected to exercise both languages:

| Function | Before | After | Refactoring boundary |
| --- | ---: | ---: | --- |
| `ContentTranslationProvider.translateMany` | 22 | 0 | Provider-specific request construction and ordered response validation |
| `SearchPage` | 24 | 15 | Result loading/error handling and normalized active-filter labels |

The Kotlin helpers score 10 and 12; the TypeScript helpers score 2 and 6. All are
below the new maximum. New Kotlin KDoc records provider-specific behavior,
timeouts, ordering, errors and language handling; TypeScript helper documentation
records the search fallback and filter contracts. Existing provider endpoints,
payloads and page rendering are preserved.

The pilot also updates boundary checks to **20 passes / 21 fails**, adds a Kotlin
score-increase check, and keeps the unfinished editor page visible as a named
reporting exception. Baselines are initialized from current `main`, then only the
two pilot exceptions are removed. The rest of the cleanup remains separate work.

At a maximum of 20, current `main` starts with 19 Kotlin findings and 38
TypeScript/JavaScript findings, including the deferred editor page. After the
pilot, 18 Kotlin findings and 36 TypeScript/JavaScript baseline findings remain,
plus that one deferred page. That pilot inventory contained **48 production
functions and 6 test/fixture functions**. Deferring the editor service's two
over-limit functions (`publish` and `replay`) leaves **46 production functions
and 6 test/fixture functions** in the pilot cleanup scope.

Local pilot verification passed the full identity check (96 tests and Spotless),
the gateway suite (917 Vitest and 13 Node tests), gateway lint/typecheck and
production build, 13 TypeScript policy tests, 7 Kotlin score-check tests, and the
real Gradle 20/21 boundary test. Search-page statement coverage is 100%; the new
Python score check exceeds 90%. An integration probe confirmed that a native
Kotlin exception cannot hide a score above its reviewed maximum.

The two refactors and local checks took approximately ten minutes of elapsed
execution, with some setup, review and tests running in parallel. Browser checks
could not launch locally because Chromium was absent and the pinned container
image download was denied; PR CI supplies the browser verification. This small
pilot demonstrates the straightforward extraction path, but does not measure the
more involved publishing, replay and diff refactors. Re-estimate those after the
first domain workflow cleanup rather than extrapolating these two functions.

## Work package 2: import validation

The draft branch was rebased onto fetched `main` revision **`4d07d6a`**
(2026-10-29) before this package. That revision adds sentence settings,
complete-document footnotes and other validation rules; its original
`ImportValidator.validate` scores **114**, and the file scores **139**.
The older pilot inventory is therefore not the current remaining inventory.

Import validation now has a public facade and five focused internal helpers:

| Responsibility | Kotlin file | File score |
| --- | --- | ---: |
| Public validation and retry entry points | `ImportValidator.kt` | 8 |
| Provenance, jurisdiction and format selection | `ImportMetadataValidation.kt` | 28 |
| Root, child and sentence-setting policy | `ImportOutlineValidation.kt` | 14 |
| Ordered hierarchy, ancestry and shared identities | `OrderedImportValidation.kt` | 12 |
| Legacy text projections, numbering and hierarchy | `LegacyImportValidation.kt` | 30 |
| Entry payloads and complete-document rich rules | `ImportRichContentValidation.kt` | 24 |

`validate` now scores **2**, and the largest extracted function scores **19**.
All six files meet the maximum of 100 and every function meets 20. Their total
file score is **116**, compared with 139 before decomposition; no control flow
was moved into unmeasured property initializers. Both ImportValidator baseline
exceptions are removed. New classes and helper functions have KDoc describing
ordering, pinned outlines, exact text and complete-document validation contracts.

The service's **100 tests** pass, including **15 new characterization tests**
covering exact public diagnostic codes, messages and ordering. An independent
seeded differential check compared **1,500 requests / 6,000 public results**
against the original implementation with no differences. It exercised metadata,
outline fallback and duplicate levels, legacy and ordered trees, identities,
ancestry, rich tables, annotations, marks, references and line breaks.
The comparison used isolated temporary test sources and build output, which are
not part of the application or repository test suite.

Baselines were first synchronized to current `main`; all newly accepted or
changed debt came from source matching that revision byte for byte, then the
cleaned validator exceptions were removed. At the end of that package the inventory was **18 Kotlin
method exceptions, 7 Kotlin file exceptions, and 44 TypeScript/JavaScript
exceptions plus the deferred EditorPage**. Excluding the editor service's two
functions leaves **53 production functions and 7 test/fixture functions** in the
cleanup scope at that point. Editor-service and EditorPage were still deferred
then; that package changed no editor source compared with its `main` base.

The next domain packages can address ingestion import/export or shared
hierarchical diffing. Treat their workflow and fidelity risks separately from
this validation-only decomposition; the original human effort ranges below
remain historical estimates, not measured delivery times.

## Work package 3: import/export read-back

Fetched `main` remains at **`4d07d6a`**. This package separates the export
workflow while retaining its constructor, endpoint and response contracts.
No new baseline debt or analyzer exemptions are introduced.

| Responsibility | Kotlin file | File score |
| --- | --- | ---: |
| Authorization, snapshot loading and response assembly | `ImportExportService.kt` | 14 |
| Snapshot hashing, flattening, cursors and bounded pages | `ImportExportRecords.kt` | 22 |
| Source/version/content fidelity and manifest discrepancies | `ImportExportFidelity.kt` | 57 |
| Ordered resource and linked-document counts | `ImportExportCounts.kt` | 12 |

`export` falls from **57 to 6**, and the extracted directional `compare` falls
from **35 to 5**. The largest function is the documented historical-default
predicate at **15**. All four files meet 100; their total is **105**, compared
with 117 in the original file. Two method exceptions and one file exception
are removed. KDoc explains authorization boundaries, exact serialized hashes,
JSON Pointer escaping, UTF-16-safe chunks and directional fidelity defaults.

The contract tests cover ownership/scope checks before downstream access,
service versus caller credentials, snapshot-bound cursors and their error
precedence, 200-record pagination, long Unicode text and escaped paths.
Focused helper tests cover source/settings/version pins, exact mismatch
ordering, historical defaults, legacy projections, resource counts and the
100-versus-101 mismatch completeness boundary. Complete mismatch lists are
retained until response truncation; submitted views never claim persisted
fidelity or complete linked resources.

The full ingestion check and Spotless pass: **127 tests**, including **27 new
contract/helper tests**, with no failures or skips. All four export files have
**100% line coverage (159/159 lines)**; their combined branch coverage is
215/234. The Kotlin complexity gate reports no new or increased scores.

At the end of package 3 the inventory was **16 Kotlin method exceptions, 6 Kotlin file
exceptions, and 44 TypeScript/JavaScript exceptions plus the deferred EditorPage**.
Excluding the editor service's two functions leaves **51 production functions
and 7 test/fixture functions** in the cleanup scope at that point. Editor code
was unchanged. Shared hierarchical diffing followed in the next package.

## Work package 4: shared hierarchical diffing and editor inclusion

Fetched `main` remains **`4d07d6a`**. The shared diff engine serves both
amendment and editor review flows. Its public API and `hierarchical-1` algorithm
version are unchanged, preserving stored finding keys, fingerprints and review
pins. Editor previews still disable the shared-revision shortcut.

| Responsibility | Kotlin file | File score |
| --- | --- | ---: |
| Public models and comparison entry point | `HierarchicalDiff.kt` | 0 |
| Ordered indexing and reference construction | `HierarchicalDiffIndex.kt` | 3 |
| Occurrence/revision groups and logical matches | `HierarchicalDiffMatching.kt` | 22 |
| Finding identity, phases and subtree/pair changes | `HierarchicalDiffComparison.kt` | 18 |
| Global text moves and local text lineage/edits | `HierarchicalDiffText.kt` | 28 |
| Shared sibling order and final finding order | `HierarchicalDiffOrdering.kt` | 26 |

`compare` falls from **92 to 0**; the largest extracted function scores **13**.
All six files meet 100 and their total score is **97**, compared with 115 before
refactoring. Indexing, grouping and emission helpers have KDoc documenting
precedence, ambiguity, exact text, path anchoring and stable identity formats.
The completed method and file exceptions are removed.

Fourteen new characterization tests passed against the original engine before
refactoring. They cover editor previews, shared revisions, global text movement,
node/text split and merge ancestry, duplicate identities, subtree replacement,
LIS tie choices, semantic-only edits and settings impact. A golden key and
fingerprint captured from the original implementation protect stored review pins.
An isolated seeded comparison checked **2,000 scenarios / 4,000 complete DiffRun
results**, including both shared-revision modes, with no differences in findings,
references, ordering, keys, fingerprints, groups or settings impact.
Full local checks pass for **Platform (39 tests), Amendment (65 tests) and
Editor (70 tests)**, plus **13 TypeScript policy tests**. Shared diff code has
**270/273 covered lines** in the platform report; repository and consumer probes
provide additional execution coverage. Both complexity gates pass with no
unreviewed debt or score increases.

The editor deferral has ended for the whole repository. The TypeScript checker
no longer contains a named exemption or a deferred status. Only EditorPage's
unchanged existing-debt entry is added (score **165**); no editor source or other
TypeScript baseline changes are included. Its body can no longer change while
retaining a construction waiver. Policy tests exercise that normal enforcement.

At the end of work package 4 the inventory was **15 Kotlin method exceptions, 5 Kotlin file exceptions
and 45 TypeScript/JavaScript exceptions**, with **no deferred functions**.
All **53 production functions and 7 test/fixture functions** are now in scope,
including editor publishing, structured replay and EditorPage. Those editor
workflow packages can proceed under the same function/file budgets.

## Batch 1: complete the priority-hotspot tranche

The earlier plan named six production priorities without numbered batch boundaries.
Batch 1 groups those six hotspots; import validation and shared diffing were already
completed in work packages 2 and 4. The remaining four editor hotspots are now
refactored on fetched `main` **`f927cad`** (2026-11-01), including its latest
source-evidence review and compact editor changes.

| Priority hotspot | Before cleanup | After | Result |
| --- | ---: | ---: | --- |
| `ImportValidator.validate` | 114 | 2 | Completed in work package 2 |
| `HierarchicalDiff.compare` | 92 | 0 | Completed in work package 4 |
| `EditorService.publish` | 102 | 2 | Publication phases extracted within the existing transaction |
| `StructuredDraftEngine.replay` | 155 | 0 | Operation dispatch, tree/text edits and final validation separated |
| Gateway `EditorPage` | 165 | 10 | Route/auth, session state and unchanged rendering separated |
| Gateway command `POST` | 88 | 3 | Explicit command dispatch and focused request/error/operation handlers |

All six priority functions meet **20**. All new Kotlin files meet **100**; the
largest publication helper function scores **10**, replay helper **19**, page
helper **15** and command helper **5**. New Kotlin classes/helpers have KDoc;
TypeScript helpers have JSDoc explaining their contracts.

Publication keeps authentication, locking, visibility, evidence revision, retry
and status checks in the existing `@Transactional` service entry. Plain internal
helpers execute in that same transaction and preserve preparation, reservation,
request validation, source-tip checks, amendment selection, successor writes,
link/refresh retries, outbox and audit ordering. The existing public constructor
and API are unchanged. `EditorService.kt` falls from **179 to 55**; its helper
files score **9, 37, 32, 27 and 7** (combined **167**, previously 179).
An isolated 90-scenario publication comparison matched public results/errors and
globally ordered repository/downstream calls against the original service, across
legacy/structured, legal/correction, reserved retries and link/refresh failures.
Generated legacy UUIDs and timestamps were normalized for that comparison.

Replay retains operation order, exact rich text, identity/lineage and error
precedence. Final outline/rich validation still runs after all operations, so
intermediate incomplete states remain valid where they were before. Its facade
file scores **0**, with helpers **35, 47, 35 and 19** (combined **136**, previously
189). An independent isolated check compared **2,400 scenarios / 12,000 complete
public results and errors** against the original replay, validation and marker
APIs, including both endnote modes, conflict codes and rich-error detail order.
All results matched.

The page preserves existing role gates, fetch/selection order, source-only routing,
global note context, actions and rendered UI. Command dispatch preserves trusted
origins, native form parsing, expected revisions, MFA, JSON/redirect mode and exact
error precedence. Page contracts passed against both the original and refactored
page; command contracts likewise first passed against the original route.

Combined local verification passes: **91 editor-service tests** (including **12
new publication-request and 8 replay contracts**), **1,257 gateway Vitest tests**
(including **9 new page and 27 command contracts**), **31 Node tests** and **13
complexity-policy tests**. Gateway typecheck, lint and production build pass;
editor Spotless and coverage reports pass. Both full complexity gates report
zero new violations or score increases. Repository hygiene and Wiki checks pass.

Before source edits, baselines were synchronized from an immutable snapshot of the
rebased branch. Kotlin debt was unchanged. TypeScript's **45 → 52** reviewed
exceptions reflect only newer `main`; every changed-source path was verified
byte-for-byte against `f927cad`. Cleanup then removes exactly two Kotlin method,
two Kotlin file and two TypeScript exceptions. Limits and waiver policy are
unchanged. After Batch 1 the remaining debt was **13 Kotlin method exceptions, 3 Kotlin file
exceptions and 50 TypeScript exceptions**: **55 production functions and 8
test/fixture functions**. Other lower-priority work remains outside Batch 1.

## Batches 2–4: editor interaction, Content and Catalog/outline

These three batches continue from `d17ac66`, after fetching unchanged `main`
**`f927cad`**. No source/dependency updates or additional baseline allowances
were needed before cleanup. The 14 production targets are:

| Batch | Responsibility | Before | After |
| --- | --- | ---: | ---: |
| 2 | `StructuredEditor` | 148 | 0 |
| 2 | Ordered canvas reconciliation callback | 94 | replacement planner helpers ≤12 |
| 2 | `renderNode` | 40 | 2 |
| 2 | Canvas `dispatchTransaction` | 32 | 14 |
| 2 | `delimitSentences` | 24 | 16 |
| 2 | Local operation replay `walk` | 26 | 2 |
| 3 | `OrderedContentService.save` | 58 | 0 |
| 3 | `OrderedContentService.validate` | 24 | 0 |
| 4 | `CatalogWriteService.createDraftVersion` | 33 | 0 |
| 4 | `CatalogWriteService.normalizeOutline` | 50 | 0 |
| 4 | `SettingsUsageClient.inspect` | 33 | 3 |
| 4 | `OutlineEditor` | 51 | 11 |
| 4 | Outline review block | 25 | replacement components ≤13 |
| 4 | Outline preview `node` | 21 | 1 |

All changed/new functions meet **20**. New Kotlin helpers have KDoc and meet
**100 per file**; TypeScript helpers have JSDoc. Bounds in the table describe
responsibilities split across replacement helpers, rather than assigning one
score to an entire helper group.

Batch 2 keeps the editor's existing command/effect bodies, React tree identity,
ref/effect order, undo/coalescing, selection, lazy loading, notes/markers, rich
formatting and exact text behavior. State/model, plain rendering and ordered
canvas planning are separated. Canvas callbacks keep anchor capture, rejection
rollback and canonical acknowledgement ordering. Original 63 helper/controller
tests passed before editing; the refactored suite adds two controller contracts.
All 71 editor acceptance tests and six new ordered planner contracts pass.
An isolated pure-function check matched **5,000 exact sentence slices** and
**5,000 complete local replay results/errors** against the original functions.
Independent planner verification also matched **10,000 exact callback/planner
cases**: roots, raw emitted order, coalesced operations and errors (7,829 successes
and 2,171 identical failures), including merge/split/move/note/reference cases.

Batch 3 preserves Content's public API/constructor and transaction ownership,
including all repeated receipt, seal and lock checks in their original order.
Immutable writes retain UUID/member lookup, current-then-source membership,
node/text insertion and final validation order. The service file falls from
**102 to 20**, with helpers **17, 16 and 21** (combined **74**, previously 102).
The full service check, Spotless and coverage pass: **63 tests**, including
**14 original-first contracts**. Independent isolated comparison matched
**600 saves** (results/errors and globally ordered repository/Catalog/receipt
calls, normalizing generated UUIDs); a separate check matched **4,000 validation
outcomes** including full rich error detail order. Coverage is **236/239 lines**
across the four production files.

Batch 4 preserves Catalog's historical request hashes, reservation fast paths,
chain-tip/source/settings checks and transaction boundary. Normalization keeps
exact defaults, Unicode delimiter policy, graph validation and error precedence.
The Catalog writer file falls from **116 to 30**; version creation, outline
normalization and impact helpers score **28, 27 and 20**, with client file **3**
and maximum helper function **16**. The full Catalog check, Spotless and coverage
pass: **86 tests**, including **14 original-first contracts**, with **93.42%**
service line coverage. Isolated checks matched **4,000 normalization results/errors**
and **260 version-creation results/errors/ordered repository traces** (generated
version UUIDs normalized).

Outline editing keeps its DOM/forms, focus, controlled state, rename/root/child
rules and payloads. Preview generation preserves path-local cycle handling,
identity/order, exact sample wording and translation-call order. All **58 focused
tests** pass, including **15 contracts also verified against the original code**.
A seeded check matched **1,500 graphs / 5,946 exact preview/translation results**.

Combined verification passes **1,280 gateway Vitest tests**, **31 Node tests**,
typecheck, lint and production build. Content and Catalog full checks pass
**63 and 86 tests** respectively; **13 policy tests**, both repository complexity
gates, hygiene and Wiki checks pass. Separate review and independent verification
found no blockers. No threshold or construction-waiver changes were needed.

Exactly **five Kotlin method, two Kotlin file and nine TypeScript exceptions**
are removed, with no new waivers or budget changes. Remaining debt is **8 Kotlin
method exceptions, 1 Kotlin file exception and 41 TypeScript exceptions**:
**41 production functions and 8 test/fixture functions**. Only
`AmendmentService.kt` remains over the Kotlin file budget (116).

The remaining batches retain the agreed responsibilities:

| Batch | Scope | Remaining functions |
| --- | --- | ---: |
| 5 | Amendment references/diff/linking and review/publication UI | 7 |
| 6 | Import, migration, setup and associated admin/review workflows | 10 |
| 7 | Public reader, rich text, translation and comparison | 12 |
| 8 | Account/site/supporting workspaces, proxy/rate limits and MCP logging | 12 |
| 9 | Test infrastructure, mock API and fixture/journey helpers | 8 |

## Original assessment at a maximum of 15

Assessment date: 2026-10-28. Source revision: `5c359b1`, before application
refactoring. This is a planning estimate based on the initial scan and inspection
of the largest functions and their existing tests; no cleanup has been performed.

For an engineer familiar with this repository, allow **25–40 engineer-days to
bring all current production findings to a maximum score of 15**, plus **3–5 days
for test and fixture code**. The six largest production findings are a useful
first tranche: roughly **8–15 engineer-days**, included in that total. At one
full-time engineer, the complete cleanup is approximately **6–9 working weeks**.
Parallel work can shorten elapsed time, but editor, content and shared diff work
need coordinated review.

These ranges include behavior-preserving refactoring, focused regression tests,
review and CI corrections. They exclude new features and architectural rewrites.
They are not a delivery commitment; a 1–2 day pilot on a few modest findings
would provide a better basis for scheduling the rest.

## Measured scope

The scan uses detekt 1.23.8 and SonarJS 2.0.4. Scores exactly equal to 15 pass.
Generated output and dependencies are excluded; handwritten test/fixture code
is included. The tools use different language-specific scoring rules, so compare
scores within each language rather than treating them as interchangeable units.

| Scope | Score 16–30 | Score 31–60 | Score above 60 | Total above 15 |
| --- | ---: | ---: | ---: | ---: |
| Kotlin production | 13 | 8 | 4 | 25 |
| TypeScript/JavaScript production | 43 | 15 | 2 | 60 |
| TypeScript/JavaScript tests and fixtures | 7 | 2 | 2 | 11 |
| Total | 63 | 25 | 8 | 96 |

There are no Kotlin test findings above 15 in this scan. Kotlin scans 303 files
and reports 2,059 functions; TypeScript/JavaScript scans 379 files and inventories
3,715 functions. The inventories are generated in
`build/reports/complexity/kotlin/all.xml` and
`build/reports/complexity/typescript/summary.json`.

The highest score, **447**, belongs to the request handler in
`apps/gateway-web/e2e/mock-api.mjs`, which is test infrastructure. It should be
split into route handlers, but it does not represent production request handling.
The next major test fixture is `e2e/fixtures/ui-review.mjs` (`response`, **94**).

## Production priorities

| Function | Score | Useful refactoring boundary | Regression concerns |
| --- | ---: | --- | --- |
| Gateway `app/editor/page.tsx:62`, `EditorPage` | 152 | Separate data loading, selection/view-model construction, workflow policy and page sections | Roles, legacy versus structured drafts, source-only corrections, review readiness and links |
| Ingestion `ImportValidator.kt:21`, `validate` | 121 | Split metadata, hierarchy, ancestry, rich content and legacy-format validation | Preserve error codes/paths, duplicate identity checks, exact text and accepted legacy input |
| Editor `EditorService.kt:257`, `publish` | 102 | Extract publication validation, source-tip checks, amendment selection and publication phases | Authorization, reviewed revisions, legal/editorial versions, retries, transaction boundaries and immutable snapshots |
| Editor `StructuredDraftEngine.kt:11`, `replay` | 99 | Separate operation handlers and explicit traversal/replay context | Split/merge text preservation, movement, lineage, revision conflicts and operation order |
| Platform `HierarchicalDiff.kt:52`, `compare` | 92 | Separate matching/grouping, text comparison, movement detection and result ordering | Stable keys/fingerprints, split/merge ambiguity, shared revisions and ordering |
| Gateway `app/editor/command/route.ts:54`, `POST` | 88 | Dispatch to command-specific handlers with shared input/error helpers | Trusted-origin checks, form parsing, redirects, JSON errors, authentication and revision checks |

## Remaining work and verification

- **Small extractions:** most 16–30 findings can be improved with named
  predicates, smaller render sections, and simpler branches. A low score does
  not imply low risk: image validation and mail configuration checks still need
  their rejection cases preserved.
- **Workflow decomposition:** scores 31–60 include content persistence,
  import/export, amendment reference validation and larger UI screens. Preserve
  ownership, transaction boundaries and API behavior while extracting helpers.
- **Test infrastructure:** split the mock API and fixture responders by route
  or domain; keep state reset and response precedence explicit. Run the browser
  journeys using those fixtures after changes.

Existing tests provide a useful starting point: `StructuredDraftApiTest`,
`OrderedSuccessorPlanTest`, `OrderedContentApiTest`, `ImportValidatorTest`,
`ImportApiTest`, the gateway command-route tests and `StructuredEditor.test.tsx`.
The shared `HierarchicalDiff` regression tests live in **amendment-service**,
not platform, so platform-only verification is insufficient for that refactor.
Add focused characterization cases where coverage of the extracted behavior is
missing; retain browser checks for navigation, focus, undo and review flows.

The detekt report's automatic **8h 20min debt** is a fixed rule allowance of
20 minutes per finding. It does not inspect these workflows or include their
regression work, and should not be used as the cleanup schedule.

Keep the new CI baseline while cleaning up in small reviewed changes, removing
exceptions as functions meet the limit. Re-run the scan after each tranche.
The goal is clearer responsibilities and preserved behavior, not merely moving
branches into arbitrary helpers to lower a number.
