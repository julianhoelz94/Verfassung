# Two-axis versions (legal × editorial)

Status: Accepted ([ADR 0005](../adr/0005-two-axis-versions.md) / ARCH-8). Implementation: Sprints 35–39.

**Working graph (Cursor canvas, not in git):** [legal vs editorial chain](/Users/julianhoelz/.cursor/projects/Users-julianhoelz-Documents-Verfassung/canvases/legal-vs-editorial-chain.canvas.tsx)

That canvas is the working graph for staff/public processes P1–P14. [ADR 0005](../adr/0005-two-axis-versions.md) is the accepted decision. This note is the git-tracked pointer for `backlog.md` and CODEMAPS. Configured UI mocks for Sprints 34–39: **[Sprint UI reference](#sprint-ui-reference)**.

## Why

ADR 0004 / CAT-5 / ED-6 put every published snapshot on **one** constitution-wide predecessor chain. After a later law exists you cannot correct an older law; if a typo-fix takes the successor slot, later laws cannot legally succeed that older snapshot.

Editorial corrections of older law versions are Wikipedia-style revision history of **that** legal object. They are not hops on the unique legal predecessor chain, and they do not attach a change-record id.

## Two axes

- **Horizontal — legal versions.** Public chips (1949, 1956, 1994, 2022). Linear legal chain; no branches or merges. The year is the legal identity; a transcription fix does not mint a new year.
- **Vertical — editorial revisions** of that object, numbered **r1, r2, r3…** on that chip (and the same r-numbers on a change record). Newest on a top rail. r1 is the original transcription of that law. Staff name a snapshot as `1949 r3`, never as a second public year. A published-at date is metadata, not the identity.

Public “1949” resolves to the **editorial tip** of the 1949 legal identity (the highest r of that chip). Constitution `latest` is the editorial tip of the **legal** tip (the newest public chip). Permalinks by snapshot id keep ADR 0002 bytes.

## Catalog hop kinds

Only three: `initial`, `legal`, `editorial_correction`.

Do **not** distinguish `legal_amendment` vs `official_errata` as hop kinds, badges, or enums. What used to be “amending law vs gazette errata” is a **comment** (and documents) on the change record between two legal versions.

`editorial_correction` is `listing = staff`. Public lists show legal identities, not every snapshot.

`409` splits: append a legal hop only from the current legal tip’s editorial tip (`not_legal_tip`); append an editorial hop only from the editorial tip of **that** legal version (`not_editorial_tip`).

## Change records (amendment-service objects)

A hop between two legal versions is a **change record**:

- Title (timeline heading)
- Comment (free text: “12th Amendment Act”, “Official correction notice, 12 March 1968”, …)
- Documents: one or more URLs and/or archived files, optional labels
- Optional dates, optional quoted change rows
- Linear editorial revision chain of the record itself

Public timeline lists published change records (title, comment, document links). Editorial law hops stay off that timeline.

## Pins and `needs_review`

Each **published** change-record revision is pinned to two law **snapshot ids** (`reviewed_source_tip_id`, `reviewed_target_tip_id`) — the transcriptions it quotes.

When an `editorial_correction` moves a law’s editorial tip, automatically set `needs_review` if pins ≠ live tips. Do not auto-rewrite quotes. Staff append a new change-record revision pinned to the live tips (confirm unchanged or update quotes; AMD-10 suggest may help). Public GET still serves the last published revision until that publish.

## Association constraint

The **live hop** always runs on the top rail: editorial tip of law A → editorial tip of the change record → editorial tip of law B. `needs_review` (blue) means those tips no longer match the published pins; it does not remove the hop.

Each law **snapshot** has at most one change record **forward** and at most one **backward**. A retired snapshot may keep a dashed pin to the change-record’s current tip. Multiple editorial revisions of the same change record that keep the same pins collapse to one dashed line.

Enforce with partial unique indexes on the published revision’s source pin and target pin (a snapshot may be the target of one record and the source of the next).

## Human UI (existing routes, extended)

Readers never see the graph. Staff jobs are chosen by **how the session is opened**, not by a Publish dialog with two choices.

- Public chips = legal identities; “1949” → editorial tip (`1949 r3` in staff UI)
- Editorial stacks and quote pins use revision numbers (`1949 r2` → `1956 r1`), not correction years
- Staff constitution home is the **legal timeline**
- **Correct this text** on a chip → transcription only (P3). Wikipedia comment. No new public chip. Publish is **Publish transcription**.
- **Record the next legal change** (job card / dashed Next) → one workspace on the legal tip (P2). Main: article editor (copy of current tip). Side: change-record fields (title, comment, documents). Not a later prompt after the articles. **Publish new legal version** is blocked until the text is approved and the instrument is complete. That publish mints the new chip and the change record between it and the previous chip. A published hop always has two constitutional versions.
- **Document a hop between two chips that already exist** (P1) is a different control on that gap. No new chip.
- Quote review is a third task on a change record, not on article text. The review screen shows the source public version, the instrument, and the target public version side by side — last-reviewed transcription beside the latest when a chip has moved.
- `/editor/amendments` is inbox, quote review, and P1 — not the create path for the next public version

Canvas processes P1–P14: [legal vs editorial chain](/Users/julianhoelz/.cursor/projects/Users-julianhoelz-Documents-Verfassung/canvases/legal-vs-editorial-chain.canvas.tsx).

Roles stay in `docs/editorial-roles.md`. Article-text reviewer queue is still for law text; change-record metadata still skips that queue.

## Sprint UI reference

Sprints 34–39 treat these static views as the **pixel and copy contract** for screens that exist. Canvas P1–P14 remain the process source of truth. Serve:

```bash
cd docs/design && python3 -m http.server 8766
```

File: [`prototype/editor-constitution.html`](prototype/editor-constitution.html) · live `http://localhost:8766/prototype/editor-constitution.html` · three widths [`board.html?page=editor-constitution`](prototype/board.html?page=editor-constitution) (same hash).

| Process | Stories | App route | Configured mock |
| --- | --- | --- | --- |
| Staff legal timeline (P11 entry) | UI-55, UI-52 entry | Constitution editor home; `/editor/history` grouping | [`#timeline`](prototype/editor-constitution.html#timeline) — public versions as filled year cards; legal changes as shorter outline cards on the connector; History collapsed; **Needs quote review** is amber only |
| P2 Record the next legal change | UI-52, ED-7 | `/editor` session opened from **Record the next legal change** | [`#legal`](prototype/editor-constitution.html#legal) — articles copied from 2022 r3; sidebar is the instrument; **Publish new legal version** |
| P3 Correct a transcription | UI-52, ED-7, UI-59 | `/editor` session opened from **Correct this text** on a chip | [`#correct-1949`](prototype/editor-constitution.html#correct-1949) (also `#correct-1956`, `#correct-1994`, `#correct-2022`) — Wikipedia comment; **Publish transcription** only |
| P6 Quote review (stale source) | UI-56, UI-59 | `/editor/amendments/{id}` Needs review | [`#hop-1956`](prototype/editor-constitution.html#hop-1956) (`#review` is the same). Three columns: source public version (last reviewed beside latest) \| instrument + quotes \| target public version |
| P6 Quote review (stale target) | UI-56 | `/editor/amendments/{id}` Needs review | [`#hop-2022`](prototype/editor-constitution.html#hop-2022) |
| P6 / P1 Open record (pins match) | UI-56, UI-57 | `/editor/amendments/{id}` | [`#hop-1994`](prototype/editor-constitution.html#hop-1994) — same three-column layout; single **Latest · reviewed** snapshot per end |
| P1 Document a hop between two existing chips | UI-57 | Timeline gap, or `/editor/amendments` | Hop cards on [`#timeline`](prototype/editor-constitution.html#timeline) (**Open record**, not mint a chip). Next public version is `#legal`, not this list |

**Do not copy** `prototype/home.html`, `version.html`, `compare.html`, or `editor.html` for two-axis behaviour. Those are the Sprint 19–21 shell (tokens, layout, components). They still show a two-chip Germany (1949 / 2022) and “amending laws”.

UI-53 / UI-54 / UI-58 (public chips, public timeline, compare) have **no separate two-axis public mock**. Follow this note plus CAT-6 / AMD-11. Use `#timeline` only for the visual language of public-version vs legal-change cards, not as the anonymous country page.
