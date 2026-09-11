# 0004 — Amendments and editorial history

Status: Accepted  
Date: 2026-09-08

## Context

Published constitutional versions are immutable snapshots (ADR 0002 / ARCH-6). Editor publish (ED-4) therefore always mints a successor. AMD-5 then persisted a computed tree-diff as an “amendment” on every such hop. That treated editorial version control as if it were the legal history of the constitution.

Readers need two different things: the **text as it stands** (including typo fixes) and the **laws that changed the constitution**. Those are not the same list of catalog versions.

This ADR does not reopen ARCH-4, ARCH-6, or AMD-5’s matching rules.

## Decision

1. The public amendment timeline is a curated list of **amending laws** and **official gazette errata**. It is never a dump of editorial publishes.
2. Each constitution has **one linear snapshot chain**. No branches or merges. A new published version may append only to the chain tip (`409` `not_tip` if that predecessor already has a successor).
3. Each hop has a kind: `initial`, `legal_amendment`, `official_errata`, or `editorial_correction`.
4. `editorial_correction` hops are listed only to editor, reviewer, publisher, and admin (`listing = staff`). Public “latest” is still the **chain tip**, so a typo fix reaches readers. Old permalinks keep ADR 0002 bytes. Anonymous `GET` of a staff snapshot URL is `200` if the caller knows the id; the hop is omitted from public version lists.
5. Each amendment has a **linear revision history**, visible to staff. Public `GET` returns the latest **published** revision only. Withdraw hides a law from public lists; it is not a hard delete.
6. AMD-5 tree-diff may **suggest** change rows. It must not persist an amendment on every editor publish. Legal and errata article-text publishes must attach an `amendmentId` (ED-6). A law may be recorded without source/target snapshot ids.
7. Amendment metadata skips the article-text reviewer queue: an editor drafts a law, a publisher publishes or withdraws it.

## Consequences

- Catalog versions gain `predecessor_version_id`, `hop_kind`, and `listing` (CAT-5). Public country/version lists hide `editorial_correction`.
- Amendment identity moves onto `amendment_revisions` (AMD-7). `POST /transitions` remains until ED-6; after that, editor publish names the hop and never auto-records a law.
- Gateway timeline, compare hops, and version chips follow curated laws (UI-42, UI-49, UI-50). Staff use `/editor/amendments` and snapshot history.
