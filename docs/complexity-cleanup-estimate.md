# Cognitive complexity cleanup estimate

## Current target and pilot

The agreed maximum is now **20 per function**, with `EditorPage` temporarily
deferred while under construction. The original assessment below used a target
of 15 and remains a historical comparison, not the active cleanup scope.

Refactoring `services/editor-service` is also deferred until the new editor is
ready. Its current method and file scores remain recorded as existing debt;
the file-budget change introduces no service source changes. Kotlin's separate
file budget is **100**, including contained helper functions.

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
cleaned validator exceptions were removed. The remaining inventory is **18 Kotlin
method exceptions, 7 Kotlin file exceptions, and 44 TypeScript/JavaScript
exceptions plus the deferred EditorPage**. Excluding the editor service's two
functions leaves **53 production functions and 7 test/fixture functions** in the
active cleanup scope. Editor-service and EditorPage refactoring remain deferred;
this package changes no editor source compared with current `main`.

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

The current remaining inventory is **16 Kotlin method exceptions, 6 Kotlin file
exceptions, and 44 TypeScript/JavaScript exceptions plus the deferred EditorPage**.
Excluding the editor service's two functions leaves **51 production functions
and 7 test/fixture functions** in the active cleanup scope. Editor code remains
unchanged. Shared hierarchical diffing and the remaining domain write workflows
remain separate packages.

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
