# Sprint 65 — Recovery, audit reliability and reader consistency

Linear milestone: `484e96cc-cfd7-4192-9b00-f65ea8ef8269` in project P-VER-1.
Implementation: [PR #204](https://github.com/julianhoelz94/Verfassung/pull/204).
Delivery status remains in Linear. Baseline: `61ef2f2bb4af92da94c7d3b44f66856f382fbf62`.
The milestone is the source of truth. Linear's issue limit prevented new tickets;
the S65 labels below are milestone work-package labels, not issue identifiers.

## Scope and acceptance

| Work | Delivered behavior | Acceptance evidence required |
| --- | --- | --- |
| S65-AUD | Durable Identity and Editor audit delivery with stable event identity and duplicate-safe Audit appends | Outage/restart/lost-response recovery; rolled-back account changes do not emit committed-change events |
| VER-174 | Separate Audit runtime and migration database identities | Fresh/upgrade migrations and append/history work; runtime schema destruction is denied and UPDATE/DELETE cannot change stored events |
| S65-SETUP | Resume interrupted constitution setup against the exact reviewed revision | Crash/reclaim/lost-response/stale-worker tests; one constitution and the approved outline |
| S65-READER | Consistent historical/regional reader controls and search filters/routes | Source links, correction notice, contents, scoped search and neighboring versions; mobile/desktop navigation/reload/back and pinned historical links |
| S65-RESTORE | Verified backups and disposable full-stack recovery | Manifest/checksum failures stop before destructive SQL; representative restored content/documents/authentication and rebuilt Search; measured recovery time |
| S65-OPS | Read-only usability and delayed-work checks | Reader/Search failure and overdue delivery/import/backup become actionable degraded reports; recovery clears them |

Preserve service-owned databases, published snapshot identity, exact authored text,
public API compatibility and all applied migrations. Use forward migrations.

Existing import-preparation reclaim and publication reconciliation remain in use.
Existing backup completion markers and restore preflight are retained and extended.
VER-161 remains completed historical work. VER-269 remains a separate launch
prerequisite; this sprint does not publish operator legal details or deploy the site.

## Delivery gates

- Commit and push completed increments on one sprint branch and keep one draft PR.
- Review touched packages for dead/duplicate code without deleting live contracts.
- Independent reviewer and verifier inspect the combined diff and recheck fixes.
- Run each changed service's tests and gateway lint/build, focused failure and
  browser journeys, and required CI. Preserve separate mock and real-stack evidence.
- Update affected `docs/wiki` pages and operational guides.
- Merge only with all required checks and both agents clear. Verify merged-main CI,
  Wiki workflow, published links and media before completing Linear.

## Evidence

Local service checks passed with no failures or skipped tests: Audit 10, Identity
82, Editor 47, Catalog 57, Ingestion 57 and Search 13. Gateway verification passed
447 Vitest tests, 13 Node tests, type checking, lint and production build. Focused
mock browser journeys cover setup recovery and reader usability; these are
separate from the real full-stack acceptance gate.

Backup preflight has 12 failure/compatibility tests. Operational and recovery
safeguards have 11 tests, including binary document integrity, protected aggregate
status, degraded Search, stale backups and refusal of live/shared recovery targets.
The deployment renderer/checks, repository hygiene and Wiki references are checked
in CI. All changed services also run their full checks in CI.

The PR's `full-stack-e2e` job runs the regional legacy-source reader and independent
country-route journeys, then the disposable restore. Its `legacy-migration-coverage`
artifact contains reader screenshots and fidelity coverage. Its `recovery-report`
artifact records verification of all nine database fingerprints, rejection of corrupt backups
before writes, recovery after an SQL failure, preserved encryption configuration,
source-document API/file read-back, authentication/content fixture verification,
Search outage/recovery and measured durations. Use the successful run for the
merged revision as the acceptance record; a local unit pass alone is insufficient.

The independent reviewer and verifier recheck the combined sprint diff and any
corrections before merge. The milestone completion note links the final PR, CI
and published Wiki/video evidence. No production recovery or deployment is claimed.
