# Editorial inbox and focused work

The `/editor` landing page follows the approved [interactive inbox design](https://constitution-editor-inbox.sillycurlew.chatgpt.site/). `EditorLanding` retains server-side loading and authorisation; `EditorInbox` owns search, progressive filters, list presentation and pagination. `EditorDeskFrame` and `EditorQueueBar` adapt the shared `layout/WorkCollection` frame/header/menu, grouped rows, progressive filters and context layout also used by Imports. The template composes `FullWidthPage`, `PageChromeSurface` and the measured sticky menu. The same queue bar is present in text sessions, source-evidence workspaces and individual import review. The actual editing, review, source and publication components remain authoritative; the mock's simulated passages and writes are not part of the application.

## Navigation and next actions

- Editor/admin users start in My work. Reviewer-only and publisher-only users start in their authorised queue. Combined roles expose their union; unauthorised queue queries fall back to an available view before loading.
- My work retains the author's open, submitted, approved and published records. Only an owned open text session offers Continue editing. Submitted and approved records offer View progress. Review and publication queues open their real focused workspaces; opening a row does not approve or publish it.
- Choose a constitution leads to public browsing. Session creation remains an explicit action in the constitution viewer, with the existing owner/version/work-type reuse rules.
- The work bar contains the queues and the focused context toggle. There is no generic Tools menu. The document library remains in global navigation; constitutional legal/text history remains available in the relevant viewer and existing editorial destinations.

## Data and filtering

`editor-inbox-data` loads complete paginated session and import lists for authorised queues. Selected-row metadata resolves distinct source versions and their country/jurisdiction/constitution owners in batches of six. Optional Catalog failures preserve the work rows and use readable unavailable labels. National, regional and historical ownership is retained. Missing import version labels or timestamps are not replaced with job IDs or invented dates.

Session and import failures are independent. Available work remains visible, incomplete counts are omitted, and a failed service is never represented as an empty queue. With no available work after a partial failure, the page explains that the remaining work could not be loaded. Retry is an explicit fresh read.

Search and immediately applied status/country/work-type filters operate on the complete selected dataset; presentation starts with 20 rows and provides Show 20 more. Archived work is a separate location and read. Active filters have removable chips. The URL retains the applied query/filter state, including reload and copyable links. The empty inbox keeps an archive entry even when no current work is present.

## Context and retention

Text sessions use a compact focused heading with the work type, status and pinned source label alongside the return control. The inbox keeps its larger editorial heading. This preserves room for the structured canvas on phones; its queue and context controls stay on one row. Display preferences retain their shared controls with compact working-view spacing. Open canvas tools measure both the visible viewport and shared chrome, moving upward when space below the toolbar is insufficient; this also runs after viewport resizing and remounting Edit.

The focused context pane stays mounted while hidden. The text editor, source picker, optional document metadata, change-record fields and publication forms keep their existing React identity and native validation/permission boundaries. Text-session context shares the existing `EditorDraftState` provider with the canvas, so hiding it cannot bypass unsaved-change submission requirements. The canvas toolbar measures the outer queue bar as well as the global header.

Native work links retain existing before-unload draft protection. This redesign does not introduce automatic saves or replace the application's save, review, MFA or publication commands.

Account-scoped session storage remembers the return inbox for a specific work item, each queue's filters, expanded pagination, invoking row and scroll position. An explicit return URL in a copied workspace link is remembered before saving can replace that query. This is a navigation aid, never an authority for loading or changing work. `safeInboxHref` accepts only a canonical `/editor` inbox query with a closed parameter set. Work-management redirects retain that validated state; external URLs, workspace IDs and command destinations are rejected as inbox return targets.

## Work management and verification

Row More actions use the shared keyboard-accessible `ReaderMenu`. Archive, restore and draft discard each require an explicit native dialog confirmation. Management remains restricted to existing supported owned states, with the server and owning service enforcing every write. No document record is removed by managing a work item.

Verification covers ownership, role defaults, complete lists and deduplicated metadata reads, combined session/import filters, distinct failure/empty states, retained context fields, pagination/return focus, review/publication/MFA journeys and EN/DE layouts. Pixel baselines use the repository's pinned Linux Playwright environment; system Chromium captures are behavioural/layout evidence only.
