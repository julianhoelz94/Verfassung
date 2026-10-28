# Cognitive complexity cleanup estimate

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
