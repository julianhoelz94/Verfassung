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
