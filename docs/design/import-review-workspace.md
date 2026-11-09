# Shared import review workspace

The individual import review at `/editor?importJobId=…` and archive packages at
`/admin/import/packages/[id]` use one `ImportReviewWorkspace`. `/admin/import`
lists packages and individual imports together; package membership prevents the
same versions appearing as separate queue entries. Upload and constitution setup
remain available on that page. Former `/admin/migrations` links redirect into
Imports and retain source, selection and pagination context.

The shared workspace uses the constitution viewer's `FullWidthPage` shell with
`PageHeader`, `PageChromeSurface` and sticky menu, measured header offsets, semantic tokens,
`ReaderIcon` and the shared `ConstitutionDocument`/`OrderedContentTree` renderer.
The menu spans the viewport while the heading and review body keep their content
measure. Both viewers share compact menu spacing, a divider after the pane toggle,
active button styling and labels that collapse to accessible icons on phones.
The package pane toggle is first in the menu and uses the reader's contents icon.
Narrow screens initially hide the package pane. Primary workflow actions pair
their label with a centered SVG arrow.

## Task and display views

- Constitution versions have **Inhalt / Content**, **Prüfung / Review** and
  **Verlauf / History**. Supporting resources have Content and History and link
  to their existing document, amendment or comparison workflows.
- Content offers **Nur Lesefassung / Reading text only**, **Nur Quelle / Source
  only**, and **Lesefassung und Quelle vergleichen / Compare reading text and
  source**. There is no separate Source tab.
- Missing captures do not fabricate a comparison: source metadata and submitted
  content remain inspectable, while comparison is unavailable.
- Tabs hide mounted panels. The single review-reason field survives view changes;
  a per-job session-storage draft also survives item navigation and failed actions.
  Rejection requires confirmation. Publication uses the existing fresh-authentication
  handoff rather than the mock's simulated authenticator.

`ImportReview` owns staff authorization and server-side reads; its slots keep
source evidence, prepared content and command data out of the client controller.
Current reader presentation is applied to the prepared immutable snapshot.
Submitted previews have separate anchor prefixes.

## Evidence and preparation

The source inventory binds source keys, capture keys and target keys explicitly;
an unrelated first source is never substituted for a selected item. Captured bytes
are checked against their checksum and decoded with the recorded encoding before
rendering. `parse5` parses archival markup as data. Only semantic elements and
explicitly allowed attributes are rendered; scripts, styles, embedded content,
resource requests and event handlers are omitted. Exact source text, pinned file
links, metadata and the original 30,000-character pagination remain available.

An Editor/Admin authorizes **Prepare import**. The bounded preparation scheduler
processes prerequisites first, continues independent branches, and attempts each
eligible item once. Missing/cyclic dependencies and saved failures require attention;
ordinary prerequisite/publication waiting remains neutral. An uncertain write is
read back and is not automatically replayed.

Approval and publication retain their existing backend permissions. Commands verify
that the selected job belongs to the supplied package before using that context.
After an Editor/Admin publishes a version, eligible dependencies are resumed. A
Publisher-only account retains its publication rights; remaining preparation still
requires an Editor/Admin. There is no new background worker or stored elevation
of a publisher's permissions.

The former migration screen sources are retained outside the deployment build in
`archive/legacy-routing/migration-review/`. Redirect routes contain no duplicate
review implementation.
