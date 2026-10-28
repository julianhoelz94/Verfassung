# Specification-derived coverage improvement

Authorized 28 October 2026. This follows the completed Sprint 67 measurement work;
it does not reopen that sprint or change its production-source denominator. No
existing Linear issue covers this maintenance scope; do not create unrelated
issues. Work branch: `codex/specification-test-coverage`.

## Baseline and acceptance

Main `5c359b1511b7769c14c1c57dd827377ca54a888a`, CI run `40702521870`:
15,471 / 21,388 production lines (72.33%). Gateway TypeScript is 2,227 / 5,546
(40.16%); Python is 1,306 / 1,951 (66.94%). Every JVM component is already above
80%. Browser acceptance tests remain separate required checks.

Reach at least 80% whole-repository line coverage, aim for 85%, keep the existing
80% changed-code gate, and add an overall floor and component regression floors.
At a fixed denominator, 80% needs 1,640 additional covered lines and 85% needs
2,709. These are planning estimates, never instructions to invent assertions.
Do not remove eligible production files or count imports as behavioral evidence.

## Test design rules

Identify a requirement below before implementing a test. Expected results come
from accepted ADRs, documented user workflows, and HTTP contracts. Read current
code to find the entry point, not to define the correct answer. Add explicit
examples with independently authored fixture values. Mock external boundaries;
execute the session/action/rendering/adapter under test. Assert observable results
and forbidden side effects, including failures. Preserve database and browser
acceptance tests for guarantees that mocks cannot establish.

An ambiguous requirement needs a documented decision; current behavior is not
automatically correct. If a specification test fails, investigate and repair the
behavior rather than weakening its expectation. Run representative deliberate
faults to demonstrate that security, version selection and failure assertions
actually reject unwanted behavior. Record fault, test, and observed failure.

## Ordered test inventory

| ID | Specification | New tests and required outcomes |
| --- | --- | --- |
| AUTH-1 | Account Guide; Sprint 60 security invariants | Password/MFA/passkey success sets an HTTP-only, root-path, SameSite cookie with deployment-appropriate Secure and supplied expiry. Pending MFA sets only a short-lived challenge, never an authenticated cookie. Failed/expired challenges cannot mint sessions. |
| AUTH-2 | Account Guide; `interpret-me` contract | Missing/expired/revoked sessions render signed out. Identity outages preserve the cookie and report unavailability. Logout clears both browser credentials even when Identity is unavailable. Protected commands require a bearer. |
| AUTH-3 | Account Guide; Identity controller contracts | Registration/reset/invite, passkey enrollment/step-up, recovery, role changes and credential lifecycle use the specified methods, payloads, identity binding and bearer. Preserve structured failure codes; never retry a failed write. |
| ACCOUNT-1 | Account Guide; Admin Guide | Password/reset/invite actions preserve safe destinations and expose no recovery credential in redirect URLs. Invalid preferences do not write. Protected account commands require sign-in; account administration additionally requires admin. Fresh-MFA failures lead to verification rather than reporting success. |
| EDGE-1 | Sprint 60 security invariants; deployment setup and anonymous browsing policy | Setup and identity failures fail closed; ordinary users cannot bypass unfinished setup. Restricted browsing requires a valid session. Legacy redirects run after access gates and preserve query. CSP nonces agree between request and response; forged history context is removed. |
| READ-1 | ADR 0002; ADR 0005; User Guide | Public country/version/compare/timeline pages select legal identities and their current editorial tips; explicit historical snapshots retain their content identity. Unknown resources are 404. Catalog failures show recovery; optional service failures do not erase available reading content. |
| READ-2 | Ordered content traversal; User Guide | Comparison distinguishes added/removed/changed/unchanged passages using independently authored before/after fixtures. Hide unchanged by default, show when requested. Authored labels, languages, table/footnote order and source attribution survive rendering. |
| EDIT-1 | Editorial roles; ADR 0005; Editorial Guide | Editor/reviewer/publisher/viewer command permissions and state transitions remain distinct. Draft saves are not publications. Conflicts and upstream rejection cannot produce success messages. Editorial corrections do not create new legal identities or rewrite prior snapshots. |
| OUTLINE-1 | Constitution settings and editor compatibility; Editorial Guide | Admin structure inputs preserve literal labels, title policy and ordered mixed content. Preflight precedes save; rejected changes do not claim success. Published snapshots are never restructured in place. |
| DOC-1 | Document service plan/migration; Editorial Guide | Revision-aware document create/revise/upload/link commands preserve expectedRevision and exact revision/scope pins. Unauthorized writers cannot mutate. Conflicts/upload failures remain visible; return paths stay local. |
| WIKI-1 | Editorial Guide; Catalog wiki contracts | Save and publication are separate. Validate target, preserve revision guards, order images, require alt text, pin uploaded image revisions and attachments to the saved draft. Failures must not claim publication. |
| API-1 | Catalog/Content/Amendment/Search controller contracts | Exercise real gateway adapters against explicit HTTP fixtures: encode opaque identifiers, carry filters and authorization, preserve pagination, distinguish 404 from failure, handle invalid response bodies and never retry writes. |
| OPS-1 | Operations Reference; manual deployment safeguards | Migration dry-run does not mutate, malformed/unavailable input fails visibly, repeat execution is safe, and partial completion does not claim success. Deployment/recovery errors retain diagnostics and reject unsafe actions. |
| OPS-2 | Sprint 67 measurement policy | Instrument existing publish/transport acceptance checks where practical and merge their observations without duplicate lines. Report newly measured existing execution separately from newly specified regressions. Missing/stale inputs must remain failures. |
| GATE-1 | This plan; Sprint 67 measurement policy | Whole-repository and per-component floors use exact ratios; empty changed executable code stays N/A. Missing components, corrupt reports and stale source hashes fail. Test threshold boundaries and regression reporting. |

## Delivery and verification

1. Authentication/account/edge contracts, then public reader/comparison and API
   contracts, then remaining editorial/admin interactions. Measure after each
   group; prioritize remaining requirements by risk and uncovered behavior.
2. Operational tool regressions and honest collection of existing acceptance
   execution. Add coverage floors after the measured result meets them.
3. Gateway tests, typecheck, lint and production build; focused Python checks;
   every changed service's Gradle check; mock/visual/full-stack CI acceptance.
4. Scan touched packages for duplicate/dead test helpers. Independent reviewer
   and verifier inspect the combined diff and recheck corrections. Merge only
   after required CI and both reviews clear. Update Technical Development Wiki,
   wait for post-merge Wiki/media publication and verify published references.

## Evidence

Implementation results, discovered defects, controlled-fault checks, final
coverage and exact CI revisions are recorded here as delivery proceeds.


### Implemented behavior and controlled-fault evidence

- Added specification suites for session/MFA/passkey cookies, account and admin
  commands, setup admission/CSP, public legal identities and historical permalinks,
  complete/scoped API reads, comparison and history, editorial role/state controls,
  structure preflight/revision guards, document pins, contextual draft/publication,
  reviewed imports, consent and translation, and OAuth redirect/resource binding.
- Document attach return paths accepted control characters, encoded slashes and
  dot segments that could normalize to external navigation. The three new
  regressions failed before replacing the duplicate check with `safeReturnTo`;
  all pass after the correction.
- Translation accepted missing, partial and non-string response arrays. Five
  specification cases failed before adding response cardinality/type validation;
  rejected responses now preserve original content through the existing error UI.
- Four isolated faults were inserted and automatically restored locally. Assertion
  failures detected removal of HTTP-only cookies, replacement of the current
  editorial tip with the legal snapshot ID, bypassing fresh MFA for import
  publication, and enabling writes in migration dry-run. Test logs were inspected
  to distinguish assertion failures from tooling/compilation errors.
- Migration regressions execute dry-run/apply/retry selection against a transport
  double: preserve legacy attribution and published revisions, pin exact document
  and scope revisions, do not duplicate work, and recover after a partial failure.
- Media regressions use valid PNG fixtures and a fake codec process boundary to
  verify dimensions/duration validation, decode failure and revision-bound output.
  Actual encoding, complete decoding and browser playback remain CI obligations.
- Python CI now collects existing publication and transport acceptance execution,
  in addition to real recovery execution. This is measurement of existing checks;
  it is not counted as newly implemented behavioral testing.
- Overall/component threshold regressions cover exact boundaries, rounding below
  a floor, independent component failure, N/A changed lines, invalid policy and
  readable failure reports. The existing changed-code gate remains independent.

Final CI and publication evidence is maintained in [PR #213](https://github.com/julianhoelz94/Verfassung/pull/213); the exact implementation checks are recorded below.


### Review corrections and current-main compatibility

Independent review found and corrected a revision-pin fixture that returned the
current document revision regardless of the requested historical revision. The
fixture now honors document ID and `?revision=2`, and the assertion requires the
revision-2 pin. The import matrix now rejects every non-capable editorial role,
not just viewers. Both new execution artifacts replace prior artifacts on rerun.

Main advanced during implementation through dependency upgrade PR #205 and work
controls PR #212. The branch was rebased onto `d2f41ae61d1272b790c4117f93e5878e85edf103`.
React 19 tests use native DOM events through the already pinned testing-library
helper; proxy admission tests follow the new `proxy.ts` entry point and avoid
repeating the existing proxy regression cases. Original expected outcomes remain.
The upgraded baseline is 73.34% (15,842 / 21,600 lines); final evidence must use the
rebased combined tree rather than the earlier 72.33% snapshot.

The current local run passes 13 Node tests and 898 Vitest tests across 87 files;
gateway line coverage is 73.85% (4,136 / 5,600). Typecheck and lint pass. These are
local component observations, not a substitute for the complete CI aggregate.


### Verified combined implementation

Independent reviewer and verifier cleared `e4c43aaaafbccd533696a0caad698600fbaad66f`
after rechecking all three corrections. The verifier independently passed 13 Node
and 898 Vitest tests, typecheck, lint, a Next 16 production build, 34 coverage-policy
checks and 27 operational checks. Source duplication/dead-helper and repository
hygiene scans found no remaining cleanup blocker.

[CI run 40749461326](https://github.com/julianhoelz94/Verfassung/actions/runs/40749461326)
passed all 31 jobs, including real publication, mock/visual/full-stack browser
journeys, documentation journeys and disposable backup recovery. Its tested merged
revision is `73750e19fd39ebcc6ae27f1ad716a548ff02023e`, base `d2f41ae61d1272b790c4117f93e5878e85edf103`.
The artifact's source-line totals independently reconcile with disjoint component
totals: **17,981 / 21,631 lines (83.13%)**; changed code **34 / 35 (97.14%)**.
Gateway is **4,136 / 5,600 (73.86%)**, Python **1,655 / 1,980 (83.59%)**. Every JVM
and MCP component retains the upgraded baseline's covered/eligible counts. The
80% repository objective is met within the requested 80–85% range. Python's floor
is ratcheted to 83%; gateway's is 73%; unchanged components keep conservative
floors based on verified main. No production-source exclusion was added.

A final quality pass strengthens the translation batching examples: three distinct
chunks cross the 20,000-character budget, and 129 distinct passages cross the
128-passage budget. Separate controlled faults removing each guard produce
assertion failures; the restored implementation passes. This brings controlled
fault evidence to six cases. The passkey assertion also checks the allowed
credential's decoded bytes. These are stronger behavioral assertions, not changes
to application behavior. Final head/main CI and published Wiki/media references
are recorded in the PR once their workflows complete. No site deployment belongs
to this task.

The final settings tests also execute the real admin/session guard against a
verified HTTP identity, rejecting viewer/editor/reviewer/publisher attempts for
all three settings commands before any write. The final local suite passes 13
Node tests and 912 Vitest tests; typecheck and lint remain clean. These supplemental
changes modify tests, evidence and the Python floor only; application behavior is
the same as the fully verified combined implementation above.
