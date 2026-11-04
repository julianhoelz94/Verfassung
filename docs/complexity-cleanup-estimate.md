# Cognitive complexity cleanup estimate

## Current target and pilot

The agreed maximum is **20 per function** and **100 per Kotlin file**.
All editor code is back in scope as of 2026-10-30; there are no construction
exemptions. The earlier editor deferrals described in the package history below
have ended. Batch 1 now brings the editor page, command route, publishing and
structured replay under the limits, removing their cleanup baseline entries.
All editor changes follow the same normal gates as other code.

The original assessment below used a target of 15 and remains a historical
comparison, not the active cleanup scope. The completed inventory follows Batch 9 below.

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
are removed, with no new waivers or budget changes. At the end of Batches 2–4,
remaining debt was **8 Kotlin
method exceptions, 1 Kotlin file exception and 41 TypeScript exceptions**:
**41 production functions and 8 test/fixture functions**. Only
`AmendmentService.kt` remained over the Kotlin file budget (116).

## Batches 5–6: amendment and ingestion workflows

Fetched `main` remains **`f927cad`**. These batches complete the next **17
production functions**, preserving existing public behavior and transaction
boundaries. They remove seven Kotlin method exceptions, ten TypeScript exceptions
and the last Kotlin file exception without adding allowances or changing limits.

| Batch | Function | Before | After |
| --- | --- | ---: | ---: |
| 5 | `AmendmentService.validateChangeRefs` | 53 | 0 |
| 5 | `AmendmentService.linkedChanges` | 22 | 0 |
| 5 | `AmendmentDiff.diff` | 28 | 0 |
| 5 | `DiffReviewQueue` | 35 | 0 |
| 5 | `PublishForm` | 29 | 20 |
| 5 | `AmendmentDetailPage` | 32 | 15 |
| 5 | `ChangeOverview.richPreview` | 24 | 3 |
| 6 | `ImportService.importVersion` | 22 | 5 |
| 6 | `MigrationService.prepare` | 22 | 7 |
| 6 | `SetupProposalService.confirm` | 21 | 11 |
| 6 | `SetupProposalService.validate` | 41 | 0 |
| 6 | `AdminImportPage` | 25 | 16 |
| 6 | `SetupProposalReview` | 56 | 8 |
| 6 | `reviewSetupAction` | 21 | 6 |
| 6 | `MigrationReviewPage` | 49 | 10 |
| 6 | `ImportReview` | 44 | 15 |
| 6 | `transitionImportJob` | 26 | 5 |

Amendment reference validation now separates request-local duplicate selection,
snapshot resolution, trusted projections and linked-target changes. Legacy diff
matching retains its original phases and output order. `AmendmentService.kt`
falls from **116 to 38** and `AmendmentDiff.kt` from **44 to 16**; the five new
helper files score at most **26**, with a largest helper function of **9**.
Constructors, authorization, transaction ownership and error precedence remain
unchanged. The full service check, Spotless and JaCoCo pass **78 tests**, including
**13 new contracts verified against original code first**. Service line coverage
is **90.05%**, with **174/176 helper lines covered**. A seeded comparison matches
**10,000 complete diff results**; independent public creation checks match
**448 results/errors and globally ordered downstream/repository calls**.

Import staging retains historical payload checksums, scoped idempotency receipts,
rich validation and insert-race precedence. Migration preparation retains claimed
item handling, the original run view, declared dependencies and resource pins.
Setup validation separates metadata/outline checks from sample-tree checks;
Catalog creation stays inside the existing confirmation/recovery workflow.
Service file scores fall **93 to 76**, **57 to 42** and **72 to 19** respectively.
The five new helper files score **8/11/8/21/17**, with maximum function **13**.
All new Kotlin helpers and functions have KDoc. Full Ingestion checks, Spotless
and JaCoCo pass **136 tests**, including **9 original-first contracts**. Service
line coverage is **88.59%**, with **137/144 helper lines covered**. Independent
checks match **4,200 setup validation outcomes** and **54 confirmation/recovery
results/errors and ordered repository/Catalog/authentication traces**.

Review/publication UI keeps React tree identity, state/effect order, decision
resets, focus navigation, unload guards and exact payloads. Amendment details
retain ordered loading and notices. Import/setup/migration UI preserves forms,
role/read gates, error/redirect precedence, selection and evidence ordering.
New TypeScript helpers have JSDoc and meet 20. Focused checks pass **49 Batch 5
tests** and **60 Batch 6 tests**, including **44 new contracts also verified on
the original implementation**. A seeded UI comparison matches **1,200 exact
rendered outputs and ordered client traces**, **1,000 setup-action outcomes and
request-order traces**, and **400 import-transition results/errors and payloads**.
An independent comparison matches **2,768 exact Batch 5 rendered outputs** in
English and German, including whitespace; **109 combined focused UI tests** pass.

Combined gateway verification passes **1,324 Vitest tests** and **31 Node tests**
with coverage enabled, plus typecheck, lint and production build. Both repository
complexity gates pass with no new violations or score increases, alongside **13
TypeScript policy tests**, **14 Kotlin score-policy tests**, repository hygiene
and Wiki checks. Separate read-only review and independent verification found no
blockers.

At the end of Batches 5–6, remaining debt was **32 functions: 24 production and
8 test/fixture functions**: **31 TypeScript exceptions and one Kotlin test
exception**, with no Kotlin production-function or file exceptions.

## Batches 7–8: remaining production functions

Fetched `main` remains **`f927cad`** (2026-11-04). These batches complete the
remaining **24 production functions**, preserving public behavior and removing
exactly their 24 TypeScript baseline entries. No new allowances, threshold changes
or dependencies are introduced. Kotlin baselines are unchanged.

| Batch | Function | Before | After |
| --- | --- | ---: | ---: |
| 7 | `ConstitutionText` | 28 | 19 |
| 7 | `richText` | 49 | 7 |
| 7 | Ordered-group render callback | 57 | Dispatcher 6; new group helpers ≤17 |
| 7 | `DiffConstitutionText.pair` | 29 | 19 |
| 7 | `ConstitutionEntry` | 21 | 14 |
| 7 | `ContentTranslationBody` | 46 | 0 |
| 7 | `ReaderComparison` | 42 | 5 |
| 7 | `ReaderSurface` | 36 | 0 |
| 7 | `ComparePage` | 51 | 1 |
| 7 | `CountryConstitutionReader` | 22 | 14 |
| 7 | `originalEntriesText` | 26 | 5 |
| 7 | `findReaderText` | 21 | 7 |
| 8 | `AccountPage` | 51 | 14 |
| 8 | `AdminLegalPage` | 30 | 20 |
| 8 | `SiteHeader` menu callback | 21 | Render helper 15 |
| 8 | `WikiEditorTemplate` | 27 | 20 |
| 8 | `ConstitutionDetailsWorkspace` | 43 | 0 |
| 8 | `EditorLanding` | 55 | 11 |
| 8 | `MfaPage` | 26 | 11 |
| 8 | `LoginPage` | 21 | 16 |
| 8 | Home `Page` | 22 | 10 |
| 8 | Gateway `proxy` | 49 | 10 |
| 8 | Edge rate-limit `GET` | 26 | 19 |
| 8 | MCP `runLogged` | 43 | 6 |

Rich rendering separates body projection, ordered-group dispatch, authored marks,
reference slices and links. Exact text/whitespace, callback order, keys, note and
table behavior, legacy/ordered precedence and React tree boundaries remain intact.
Diff pairing retains stable reservations and global-identity precedence. All
**47 focused tests** pass, including **11 new contracts verified on original code**.
An isolated check matches **8,000 exact markup/error comparisons** and **2,000
callback traces**; all ordered renders succeed rather than comparing only errors.
Scoped rich-rendering line coverage is **87.86%**.

Reader helpers separate ordered copy text, Unicode DOM ranges, translation text
selection/splitting/batches/application, comparison loading and reader state from
plain presentation. Model helpers score at most **17**, presentation helpers
**16**, and every owned function and test is at most **19**. The **56 focused
tests**, including **10 original-first contracts**, retain exact separators/note
labels, UTF-16 range boundaries, translation omission/language scopes and malformed
or same-legal comparison responses. Public exports, snapshot pins, optional-service
errors, roles, loading/effect order, history and focus remain unchanged.
A seeded check matches **4,000 exact copied-text results** without input mutation,
**12,000 DOM search-range comparisons** across 1,500 trees (text, block, endpoint
node and UTF-16 offset), **384 entry/comparison rendered outputs** and **64 reader
rendered outputs** on the frozen source.

Account, legal, header, Wiki/editor workspaces, login/MFA and home pages retain
their exact DOM/forms, React slots, state/effects, credential/role checks and
ordered reads. The **74 focused tests** pass on original and refactored code,
including **six new legal contracts**. An isolated comparison matches **2,304
exact rendered outputs/errors and ordered-read traces** across all nine surfaces
in English and German. Eighteen new named workspace helpers score at most **19**.

Proxy and edge helpers retain canonical/raw-path distinctions, setup/browsing/admin
policy, credentials, CSP/nonce ordering, quotas, clocks and response headers. Their
**47 focused tests** pass, including **eight new original-first contracts**.
Independent checks match **4,680 proxy cases** and **11,880 edge cases**, including
exact status/body/headers and globally ordered setup/policy/identity/quota calls.
MCP logging retains its broad failure boundary around action, metrics, resource
selection, actor lookup, audit and serialization; errors keep their safe details
and retry mapping. All **49 MCP tests**, including **11 new original-first public
logging contracts**, pass with build and coverage. MCP line coverage is **80.95%**
(867/1,071); logging helpers cover **20/20 lines** and their entry point **15/15**.
An isolated check matches **2,014 logging results/errors and exact ordered traces**,
including throwing metrics, actors, logs, property getters and serialization.

All new helpers have JSDoc. Separate review has found no blockers in the frozen
sources, all **46 new contracts**, baseline removals and helper ownership.
Independent verification passes **196 focused tests** across 18 files and
**1,404 exact country-reader/comparison route-element/prop results, errors and
ordered-load traces** on the final sources. These route comparisons use stable
child-component stubs to isolate orchestration.

Combined gateway checks pass **1,359 Vitest tests** and **31 Node tests** with
coverage, typecheck, lint and production build. Both repository complexity gates
pass: TypeScript scans **6,885 functions**, with only seven accepted test/fixture
exceptions; Kotlin retains its one test exception and zero file exceptions.
There are no new violations, analysis errors or score increases. **13 TypeScript
policy tests**, **14 Kotlin score-policy tests**, repository hygiene and Wiki checks
pass. Separate review and independent verification report no blockers.

Actual production-build browser verification passes **28 Chromium journeys** with
zero failures or retries: all five login roles and access denials, password and
MFA/recovery, translation, reader copy/manual fallback/focus/footnotes, search,
preferences, comparison, responsive layout and accessibility. The temporary local
configuration uses installed Chromium 154 without changing repository configuration
or visual baselines; GitHub CI supplies the pinned visual and full-stack checks.

At the end of Batches 7–8, remaining debt was **eight test/fixture functions**:
seven TypeScript/JavaScript functions and one Kotlin test function. All production
functions met 20 and all Kotlin files met 100.

## Batch 9: test infrastructure and remaining fixtures

Fetched `main` remains **`f927cad`**. This batch completes all eight remaining
findings without weakening assertions, changing fixture behavior or introducing
new allowances. The seven TypeScript/JavaScript and one Kotlin method exceptions
are removed; the reviewed baseline files remain valid and empty. Limits remain
**20 per function** and **100 per Kotlin file**.

| Function | Before | After |
| --- | ---: | ---: |
| Mock API request callback | 517 | `serveMockRequest` 5; route helpers ≤14 |
| UI-review fixture `response` | 94 | 12 |
| Prepopulation `ensureVersions` | 40 | 3 |
| Scenario `runScenarios` | 34 | 13 |
| Legacy migration journey callback | 36 | 12 |
| Template journey callback | 26 | 14 |
| UI route-audit callback | 33 | 4 |
| `directBatchAndChunkedImportsRequireMarkersAndAllowSharedNotes` | 21 | 7 |

The mock API entry point now dispatches through **98 route gates in their original
order**. Nine domain modules separate scenario, Catalog, Content, Search, Identity,
Editor, Amendment, legal and ingestion responses; `state.mjs` preserves fixture
initialization, replaced state and retained collections, serialization and body
reading. Synchronous misses do not read bodies or introduce an awaited miss.
Selected asynchronous responses retain their request/state/error ordering. All
218 owned mock-module/test functions score at most **14** and have documented
responsibilities. A persistent black-box HTTP contract suite is included in both
gateway `test` and `test:coverage` commands.

UI review separates read/setup/proposal response responsibilities while preserving
undefined fallthrough, fixture-instance aliases/state, lazy body reads and revision errors.
Its **eight original-first public contracts** pass. A seeded check matches
**49,600 response/state/error/body-read comparisons across 400 worlds**. The UI
test extraction retains **nine registrations** and matches **63 callback traces**
across seven modes: **95,250 events and 321 exact soft screenshot assertions**.
Those traces use browser doubles to isolate orchestration; real-browser and pinned
visual checks remain separate. All owned functions/tests score at most **14**.

Prepopulation and scenario helpers preserve API/credential/ID ordering, version
and publication checks, token refresh, checkpoints, permission/search verification
and exact guide/index output. New helpers score at most **6**. The existing fixture
Node suite passes **29 tests**, including **two original-first compact contracts**.
Isolated comparisons match **3,000 prepopulation result/error/call/ID worlds** and
**2,000 scenario orchestration/error/context/guide/index worlds**. These use
deterministic API/domain stubs to isolate orchestration, rather than claiming a
full-stack run.

Template and legacy migration helpers preserve all **113 original assertion
expressions** and **three extracted bodies** token-for-token, plus the original
two template locale registrations and one legacy registration. Independent
registration checks preserve **all 154 mocked tests across 28 files** and the
single legacy full-stack test, including names, order and project identities.
The shared-note ingestion test retains its direct, batch and chunked calls and
assertions; its new assertion helper scores **8**, with KDoc. `ImportApiTest.kt`
falls **31 to 25**, with maximum named-function score **8**. Full Ingestion checks,
Spotless and JaCoCo pass **136 tests**, with no failures or skips and unchanged
**88.59%** service line coverage.

Combined gateway verification passes **1,367 Vitest tests** and **39 Node tests**
with coverage enabled, typecheck, lint and production build. The **16 new
original-first contracts** comprise eight UI fixture cases, two compact scenario
cases and six real-HTTP mock-server cases. Both complexity gates pass with **zero
exceptions, violations or analysis errors**: TypeScript scans **7,098 functions**;
Kotlin reports zero over-limit methods and files. **13 TypeScript policy tests**,
**14 Kotlin score-policy tests**, repository hygiene and Wiki checks pass.

Independent HTTP verification matches **6,640 exact original/refactored cases**
across route families and stateful reset, authentication, editor, import, legal,
settings and malformed/streamed requests. Status, body bytes and response headers
match; only the transport `Date` header is omitted, with application clocks fixed
equally and no dynamic-ID normalization. Source hashes bind the result to the
frozen modules. Independent review confirms all 98 ordered predicates, 25 regex
bindings, 28 mutable initial bindings and 10 shared/reset/body/serializer helpers;
95 route bodies are AST-identical after state/return-convention normalization, with
the three legal/editor/import phase extractions manually reviewed. No blockers
remain in the frozen source, assertions, helper documentation or baseline removals.

All new Kotlin helpers have KDoc and JavaScript/TypeScript helpers have JSDoc.
There are **zero remaining function or Kotlin file exceptions**. All scanned
Kotlin and TypeScript/JavaScript functions, including tests, fixtures and tooling,
now meet 20, and all Kotlin files meet 100.

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
