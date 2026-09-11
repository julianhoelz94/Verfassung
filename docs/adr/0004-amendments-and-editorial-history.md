# 0004 — Amendments and editorial history

Status: Accepted (points 1, 5–7). Points 2–4 superseded by [0005](0005-two-axis-versions.md) (2026-09-11).  
Date: 2026-09-08

## Context

Published constitutional versions are immutable snapshots (ADR 0002 / ARCH-6). Editor publish (ED-4) therefore always mints a successor. AMD-5 then persisted a computed tree-diff as an “amendment” on every such hop. That treated editorial version control as if it were the legal history of the constitution.

Readers need two different things: the **text as it stands** (including typo fixes) and the **laws that changed the constitution**. Those are not the same list of catalog versions.

This ADR does not reopen ARCH-4, ARCH-6, or AMD-5’s matching rules.

## Decision

1. The public amendment timeline is a curated list of legal instruments (title + comment + documents). It is never a dump of editorial publishes. (Wording updated for ADR 0005: not an errata enum.)
2. ~~Each constitution has **one linear snapshot chain**.~~ **Superseded by ADR 0005:** two linear axes (legal versions × editorial revisions of each law and each change record).
3. ~~Each hop has a kind: `initial`, `legal_amendment`, `official_errata`, or `editorial_correction`.~~ **Superseded by ADR 0005:** `initial` / `legal` / `editorial_correction` only.
4. ~~`editorial_correction` hops are listed only to staff; public “latest” is the constitution-wide chain tip.~~ **Superseded by ADR 0005:** editorial hops hang off the legal version they correct; public “latest” is the editorial tip of the legal tip; ADR 0002 permalinks unchanged.
5. Each amendment has a **linear revision history**, visible to staff. Public `GET` returns the latest **published** revision only. Withdraw hides a law from public lists; it is not a hard delete.
6. AMD-5 tree-diff may **suggest** change rows. It must not persist a change record on every editor publish. Legal article-text publishes must attach a change record (`amendmentId` today / ED-7 payload). Pins are required when quotes exist; they may be null only when there are no quoted transcriptions. A record may still be filed for a historical gap without minting a new chip (P1).
7. Amendment metadata skips the article-text reviewer queue: an editor drafts a law, a publisher publishes or withdraws it.

## Consequences

- Catalog versions gained `predecessor_version_id`, `hop_kind`, and `listing` (CAT-5). Public country/version lists hide `editorial_correction`. CAT-6 (ADR 0005) splits that chain into legal vs editorial predecessors.
- Amendment identity moved onto `amendment_revisions` (AMD-7). `POST /transitions` returns 410. Editor publish names the hop and never auto-records a law (ED-6). AMD-11 drops `kind` and adds pins / `needs_review`.
- Gateway timeline, compare hops, and version chips followed curated laws (UI-42, UI-49, UI-50). Staff use `/editor/amendments` (Legal changes, UI-57) and snapshot history (two-axis grouping, UI-55).
