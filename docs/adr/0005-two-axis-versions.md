# 0005 — Two-axis legal × editorial versions

Status: Accepted  
Date: 2026-09-11

Supersedes ADR 0004 **points 2–4** (one constitution-wide snapshot chain; hop kinds `legal_amendment` / `official_errata`; public “latest” as that chain’s tip). ADR 0004 points **1 and 5–7** stay in force: the public timeline is curated, not a dump of publishes; each amendment (now a change record) has a linear staff-only revision history; AMD-5 may suggest change rows but must not persist a record on every publish; article-text publish no longer auto-records a law; change-record metadata still skips the article-text reviewer queue.

Working graph (not in git): [legal vs editorial chain](/Users/julianhoelz/.cursor/projects/Users-julianhoelz-Documents-Verfassung/canvases/legal-vs-editorial-chain.canvas.tsx). Git-tracked note and staff UI contract: [`docs/design/two-axis-versions.md`](../design/two-axis-versions.md) ([Sprint UI reference](../design/two-axis-versions.md#sprint-ui-reference)).

This ADR does not reopen ARCH-4, ARCH-6, AMD-5 matching, or ADR 0002 permalinks.

## Context

ADR 0004 / CAT-5 / ED-6 put every published snapshot on **one** constitution-wide predecessor chain. After a later law exists, you cannot correct an older law: the successor slot of 1949 is already taken by 1956 (or by a typo-fix that stole the only successor). A transcription error in an old chip and a new amending law are not the same kind of hop.

Readers still need two different things: the **text of each legal edition as it stands** (including typo fixes of that edition) and the **curated instruments that moved the law from one edition to the next**. Those are two axes, not one list of catalog versions.

## Decision

1. **Two axes, both linear.** Horizontal: **legal versions** (public chips — 1949, 1956, 1994, 2022). Vertical: Wikipedia-style **editorial revisions** of each legal object (`1949 r1`, `1949 r2`, …) and of each change record. No branches or merges on either axis. The year (or other legal label) is the identity of a public chip; a transcription fix does not mint a new year.
2. Catalog `hop_kind` is only `initial`, `legal`, or `editorial_correction`. Do **not** keep `official_errata` (or `legal_amendment`) as a hop kind, badge, or enum. What used to be “amending law vs gazette errata” is a **comment** (and documents) on the change record between two legal versions. `listing = staff` if and only if `hop_kind = editorial_correction`.
3. A **change record** (amendment-service identity) is title + **comment** + **documents** (URLs and/or archived files, optional labels), optional dates, optional quoted change rows. It is not an “amending law vs errata” kind.
4. Each **published** change-record revision **pins** two catalog snapshot ids (`reviewed_source_tip_id`, `reviewed_target_tip_id`) — the transcriptions it quotes. When those pins are not the live editorial tips of those legal versions, the record is `needs_review`. Do **not** auto-rewrite quotes. Public `GET` stays on the last published revision until staff publish a re-pin (confirm unchanged or edit quotes). Anonymous responses may omit `reviewStatus`.
5. Each law **snapshot** has at most one change-record **forward** and at most one **backward** (partial unique indexes on the published revision’s source pin and target pin; NULLs excluded). The **live hop** always runs on current editorial tips. `needs_review` means published pins lag those tips; it does not remove the hop. Retired snapshots may keep a dashed pin to the change-record’s current tip. Multiple editorial revisions of the same record that keep the same pins collapse to one dashed line.
6. **Editorial publish** appends only to **that legal version’s** editorial tip (`409` `not_editorial_tip` otherwise). **Legal publish** appends only from the **legal tip’s** editorial tip (`409` `not_legal_tip` otherwise). Public “latest” is the editorial tip of the legal tip. Public lists show one row per legal identity; `currentVersionId` is that identity’s editorial tip. ADR 0002 permalinks are unchanged: `GET` of a published snapshot URL is `200` if the caller knows the id, including staff hops.

How a session is opened picks the job (transcription vs next legal change). Staff do not choose those jobs in one Publish dialog. A published legal hop always has two constitutional versions. **Record the next legal change** is one workspace (articles + instrument sidebar). Documenting a hop between two chips that already exist is a different staff path and does not mint a chip.

## Consequences

- Catalog (CAT-6) replaces the constitution-wide `UNIQUE (predecessor_version_id)` with `legal_version_id`, `legal_predecessor_version_id` (unique among published `initial`/`legal`), and `editorial_predecessor_version_id` (unique among snapshots of the same legal identity). Migrate `legal_amendment` / `official_errata` → `legal`.
- Amendment-service (AMD-11) drops `amendments.kind`. Revisions gain `comment` (from `summary`) and `documents`. Published pins and `review_status` land there; `POST …/refresh-review-status` flags mismatches without rewriting quotes.
- Editor publish (ED-7) accepts `hopKind` `legal` | `editorial_correction` only. After an `editorial_correction`, call `refresh-review-status` for that legal identity immediately. `amendment.recorded` (ADR 0003) is emitted for `legal` hops, not for `editorial_correction`.
- Gateway: public chips and compare follow legal identities (UI-53, UI-58); timeline lists change records with comment + documents, no errata badge (UI-54); staff history groups editorial hops under each chip (UI-55); `/editor/amendments` is inbox, quote review, and documenting an existing gap — labelled **Legal changes** (UI-56, UI-57). Pixel/copy for those staff screens: [Sprint UI reference](../design/two-axis-versions.md#sprint-ui-reference).
- ADR 0002 still forbids `PATCH` of a published tree. A typo fix of 1949 while 2022 is the legal tip is a new snapshot on 1949’s editorial chain, not a rewrite of the 1949 r1 bytes.
