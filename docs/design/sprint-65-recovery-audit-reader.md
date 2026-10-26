# Sprint 65 — Recovery, audit reliability and reader consistency

Linear milestone: `484e96cc-cfd7-4192-9b00-f65ea8ef8269` in project P-VER-1.
Status: implementation in progress. Baseline: `61ef2f2bb4af92da94c7d3b44f66856f382fbf62`.
The milestone is the source of truth. Linear's issue limit prevented new tickets;
the S65 labels below are milestone work-package labels, not issue identifiers.

## Scope and acceptance

| Work | Delivered behavior | Acceptance evidence required |
| --- | --- | --- |
| S65-AUD | Durable Identity and Editor audit delivery with stable event identity and duplicate-safe Audit appends | Outage/restart/lost-response recovery; rolled-back account changes do not emit committed-change events |
| VER-174 | Separate Audit runtime and migration database identities | Fresh/upgrade migrations and append/history work; runtime destructive SQL is denied |
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

Implementation and verification evidence will be recorded here as work finishes.
No production recovery or deployment has been claimed.
