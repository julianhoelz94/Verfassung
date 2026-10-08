# Sprint 49 spacing audit (VER-245)

Reviewed the mock-backed gateway in Chromium at 390, 820, and 1440px on 2026-10-06. The checked routes were `/`, `/countries/DE`, the 2022 version reader, `/search?q=dignity`, `/countries/DE/compare`, `/countries/DE/timeline`, `/login`, `/account`, `/editor`, `/editor/amendments`, `/editor/documents`, `/admin`, and `/admin/constitutions`. Full-page captures for representative findings are in [`before/`](before/). None of these routes had document-level horizontal overflow at the three widths. The existing Linux visual suite already covers home, article, compare, and editor; VER-248 will extend that coverage.

## Findings and changes

| Route and width | Observation | Change |
| --- | --- | --- |
| [Version reader, 820px](before/version-tablet.png) and [country, 1440px](before/country-desktop.png) | Breadcrumbs are a separate flex child of `PageHeader`. They sit beside or below the title block instead of directly under the title, and their vertical position varies with action width. | VER-246: put breadcrumbs in the title column after the title and give them a deliberate token gap; keep navigation semantics and wrapping. |
| [Home, 390px](before/home-phone.png) | The country card's actions and the recently changed row use different spacing for related links and badges; the latter reads as a compressed run of text. | VER-247: apply shared action/list gaps; keep the country card and recent item as distinct groups. |
| [Search, 390px](before/search-phone.png) | The query control, search action, and filter disclosure are separated unevenly; the result card is much farther from the filter than the related controls are from one another. | VER-247: group search controls and results with the shared form/section rhythm. |
| [Compare, 390px](before/compare-phone.png) | The filter card, summary badges, legal-change card, and article heading have inconsistent section gaps. The article status is a self-link. | VER-247: align section gaps. VER-249: make the status noninteractive while keeping the heading fragment target. |
| [Timeline, 390px](before/timeline-phone.png) | The document, changed-unit, compare, and read links in one card have uneven vertical gaps. | VER-247: use the card action/list rhythm without changing link destinations. |
| [Account, 390px](before/account-phone.png) | Authenticator and password forms meet inside one card with little section separation. | VER-247: separate the form sections with a shared section gap while keeping field label/control/help tightly grouped. |
| [Editor, 390px](before/editor-phone.png) | The constitution picker, session creation controls, and manual ID form stack densely; the adjacent button and next card nearly touch. | VER-251 removes creation and ID loading from this route. Apply shared action/card spacing to the resulting session list. |
| [Outlines, 390px](before/outlines-phone.png) | The guided creation card has large gaps within Basics, while step controls wrap tightly. In its Structure step, the global text-input rule also sizes checkboxes like text fields. | VER-246: correct checkbox sizing/alignment and form/step gaps; VER-249: audit display prerequisites. |

`/admin`, `/editor/amendments`, `/editor/documents`, and `/login` had no additional spacing defect in their captured default states. Validation, long-label, dense-list, and empty-state variants will be covered with focused fixtures in VER-248. The current `/editor` empty state changes under VER-251; its old creation form should not receive a page-specific CSS patch.

## Shared spacing rule

Reuse `--space-1` through `--space-8` and `--gutter`; avoid new pixel values. Keep a label, control, help, and error together at `--space-1` or `--space-2`. Use `--space-3` between peer controls in a row and `--space-4` between separate fields or adjacent card content. Use `--space-5` between cards and related subsections, `--space-6` between major sections, and `--space-7` only at page-level transitions. A wrapping action row retains `--space-2` or `--space-3` in both directions. Phone (390px) may stack controls; tablet (820px) and desktop (1440px) may place peers side by side, but spacing meaning remains the same. Text controls retain 44px minimum height; checkboxes and radios use their native size inside a label with a comfortable row target and visible keyboard focus.

The audit does not change ongoing feature behavior or reopen VER-244, which was completed in Sprint 45.

The shared header correction is shown at [390px](after/version-390.png), [820px](after/version-820.png), and [1440px](after/version-1440.png). At each width the breadcrumb begins 8px below the title and shares its left edge; no horizontal overflow was measured.
