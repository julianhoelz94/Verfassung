# Import review design comparison

The production build was compared with the constitution viewer, working editor,
country directory, regional directory and document library in English and German
at 390, 700 and 1440 pixels. Captures use synthetic API fixtures and system
Chromium. These images document the audit; pinned Playwright golden baselines
remain separate.

## Implemented corrections and integration

- The rule below **Import prüfen / Review import** is removed through the shared
  `PageHeader`'s `separator={false}` variant. The tab bar keeps its standard 1px
  lower border. Other headers retain their default separator.
- The shared picker from merged PR #248 is retained for `setup_proposal` and
  embedded in the redesigned source area for `import_job` and `migration_run`.
  Import and package evidence have separate headings and owners, even when the
  same document revision is attached to both. Citation notes stay on each link.
- The existing server loader and command adapter enforce permissions. Editors
  and administrators can attach/create; reviewers and publishers inspect these
  evidence targets read-only. Captures, checksums, capture provenance and the
  prepared wording are not changed by supplementary attachments.

## Shared design verified

| Concern | Observed result |
| --- | --- |
| Menu width and height | Import, reader and country/region bars span the viewport and are 54px high at all three widths. |
| Menu gutters | Import and reader both use `8px 32px` at 1440px, `8px 28px` at 700px and `7px 12px` at 390px. |
| Controls | Shared 36px desktop controls, 14px system text, 6px corners, green selected states and the same contents icon. Coarse-pointer rules retain the shared 44px targets. |
| Heading typography | Import, viewer and document-library headings use regular Georgia at 34px on desktop and 24px on the phone. The editor's compact 22px header and country/region hero headings are existing template variants. |
| Colours and document type | Paper, white surfaces, muted ink and green accents use the common tokens. Prepared content uses `ConstitutionDocument` and the shared ordered renderer. |
| Active and focus states | The Imports top-level section stays current. Review tabs retain arrow/Home/End navigation and focus when selected; the pane toggle retains focus when used by keyboard. |
| Sticky positioning | The menu remains below the measured site header near the bottom of the long import page. The package list retains its own bounded scrolling on desktop. |
| Mobile reflow and accessibility | No page overflow at the audited widths; all six import axe audits pass. The source/reading display selector stacks on narrow screens. |

The document library's action bar wraps to 126px on a 390px screen and 92px at
700px. The reader/import toolbars remain one compact row. This follows their
existing action sets and is not a reason to add duplicate library controls to
the import picker.

## Remaining deviations identified

These observations are retained for design review. The approved content modes,
review workflow and established layouts of other pages are preserved.

| Observation | Concrete location | Visible evidence |
| --- | --- | --- |
| Mobile progress labels use a smaller type size than other compact metadata: **11px**, while the shared `--text-xs` token is **13px**. A future alignment could use the shared token. | [Import progress media rule](../../apps/gateway-web/app/editor/ImportReviewWorkspace.module.css#L285) | [Phone comparison](screenshots/import-review/comparison-390.png), import column below the decision button. |
| The package navigation uses a **760px** breakpoint and **228px** desktop column; the shared reader/directory navigation changes at **680px** and uses **210px**. At 700px the import pane starts hidden and comparison stacks, while the reader still has its left navigation. The extra comparison space is useful, but the boundary differs. | [Import layout](../../apps/gateway-web/app/editor/ImportReviewWorkspace.module.css#L31), [import breakpoint](../../apps/gateway-web/app/editor/ImportReviewWorkspace.module.css#L255), [default pane visibility](../../apps/gateway-web/app/editor/ImportReviewWorkspace.tsx#L278), [shared layout](../../apps/gateway-web/app/components/layout/PageChrome.module.css#L16) | [700px comparison](screenshots/import-review/comparison-700.png). |
| Mobile review content uses the site gutter, **16px** at 390px; the reader's content body uses **24px**. The outer tab bar gutters match, but the content edges differ below them. | [Import layout gutter](../../apps/gateway-web/app/editor/ImportReviewWorkspace.module.css#L29), [mobile body](../../apps/gateway-web/app/editor/ImportReviewWorkspace.module.css#L267), [shared reader body](../../apps/gateway-web/app/components/layout/PageChrome.module.css#L33) | [Phone comparison](screenshots/import-review/comparison-390.png), first two columns. |

The reviewed content is framed for comparison, and supplementary evidence adds
white cards below the source. The public reader uses one continuous white
reading surface. The working editor uses a compact header and editing controls.
Those are purpose-specific compositions rather than missing reader functions.

## Screenshot evidence

- [Six-page desktop comparison](screenshots/import-review/comparison-1440.png)
- [Six-page phone comparison](screenshots/import-review/comparison-390.png)
- [Import and viewer at 700px](screenshots/import-review/comparison-700.png)
- [Full import page, desktop](screenshots/import-review/audit-import-de-1440.png)
- [Full import page, phone](screenshots/import-review/audit-import-de-390.png)
- [Sticky menu near the phone page bottom](screenshots/import-review/audit-import-bottom-de-390.png)

The repeatable capture and measurements are in
`apps/gateway-web/e2e/import-design-audit.spec.ts`. Supplementary-evidence journeys
cover file upload, a failed write and retry, input preservation across tabs,
keyboard library selection, separate notes and owners, explicit pins, setup
proposal reuse, detaching one scope without deleting the library document, and
read-only reviewer/publisher controls.
