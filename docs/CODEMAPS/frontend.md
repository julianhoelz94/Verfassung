<!-- Reviewed: 2026-10-19 -->
# Frontend (`apps/gateway-web`)

Next.js 16 App Router, React 19, strict TypeScript. No database: compose service APIs
over HTTP. Rules: `apps/gateway-web/AGENTS.md`. Current UI decisions and route/state
coverage: `docs/design/sprint-59-ui-review.md`. Earlier prototypes are historical
references; ADR 0005 and `docs/design/two-axis-versions.md` define version semantics.

## Routes and shared UI

Page composition: `app/components/layout/templates.tsx`; spacing primitives:
`app/components/layout/Layout.tsx`; runtime tokens: `app/styles/tokens.css`.
Scoped CSS Modules own page, header, surface, field and template styles. See
`docs/design/ui-templates.md` for spacing ownership and template selection.

| Area | Entry points |
| --- | --- |
| Public discovery/reading | `app/page.tsx`, `search/`, `countries/[code]/`, `jurisdictions/` |
| Reader/compare/history | `countries/[code]/versions/`, `compare/`, `timeline/`; shared `components/ConstitutionText`, `VersionReader`, ordered content/diff components |
| Context/documents/legal | `countries/[code]/` and `countries/[code]/constitutions/[constitutionId]/` context, `documents/`, `impressum/`, `datenschutz/`, `about/` |
| Authentication/account | `login/`, `register/`, `reset/`, `invite/`, `account/`, `logout/` |
| Editing/review/publication | `editor/`, `editor/amendments/`, `editor/documents/`, `editor/history/`, command routes |
| Administration | `admin/` users, settings, browsing policy, legal pages, outlines, constitutions and imports |
| First deployment | `setup/`, `lib/deployment-setup.ts`, `app/api/setup-gate/route.ts` |

List actual pages with `rg --files apps/gateway-web/app -g page.tsx`; route, query,
role and persisted state variants matter. Layout owns the shared shell, translation
provider and accessibility landmarks. Reuse existing UI primitives and reader
rendering for previews; keep authored legal text separate from translated chrome.

## Clients and contracts

| Module | Responsibility |
| --- | --- |
| `lib/api.ts` | Catalog, Content, Amendment and Search reads/common writes |
| `lib/identity-client.ts`, `session.ts` | Identity operations, session/MFA cookies and user state |
| `lib/editor-api.ts`, `amendment-editor-api.ts` | Protected editorial operations and fixed localized error keys |
| `lib/document-api.ts`, `legal-pages.ts` | Document revisions/links and legal/contact publication |
| `lib/ingestion-api.ts` | Staged jobs, proposals and review/publication commands |
| `lib/fetch-with-timeout.ts` | Shared request deadline and caller cancellation; no automatic write retries |
| `lib/ordered-content.ts`, `outline.ts`, `compare.ts`, `reading.ts` | Authored order, configured labels, stable identity and two-axis reading/compare |
| `lib/messages.ts`, `locale.ts`, `server-locale.ts` | Bilingual chrome and locale policy |
| `lib/contracts/` | Public wire fixtures used by contract tests |

Actions live beside pages. Native POST command routes validate trusted origins and
redirect to persisted outcomes. Do not remove framework exports based on import
counts. Optional-service failures must not erase required reading content.

`proxy.ts` checks deployment setup and anonymous browsing, then supplies the CSP
nonce. Caddy's setup/rate checks have separate API routes and credentials. Public
navigation visibility does not replace service authorization.

## Verification

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. TypeScript rejects
unused locals/parameters. `npm run test:e2e` covers mocked journeys, accessibility
and visual checks; `npm run test:e2e:full` uses real APIs and uploaded fixtures.
Linux screenshots are pinned to the Playwright image/version in CI. Wiki recording
is verified in PR CI; actual media capture/publication runs after merge.

## Compact structured editing

The active canvas is app/editor/StructuredEditor.tsx with ContinuousCanvas.tsx (ProseMirror), compact-editor.module.css and lib/continuous-editor.ts. `structured-editor-model.tsx` owns the existing state/command/effect lifecycle;
`structured-editor-presentation.tsx` uses plain render helpers to preserve React
tree identity, and `structured-canvas-reconciliation.ts` plans ordered operations.
Canvas transaction phases and pure segmentation/local replay helpers remain
behind their existing public exports. EditorWorkspace.tsx owns hideable navigation and workflow disclosure; ChangeOverview.tsx presents readable differences. The authenticated editor/view projection returns a pinned global note/reference index, lazy root bodies, or the full body only for explicit Preview.

Shared app/components/Footnotes.tsx and InlineText.tsx render note drawers and structured marks in editing, reading and comparison. lib/footnotes.ts indexes a pinned version once; lib/draft-footnotes.ts indexes draft notes before lazy projection. Readers use lib/ordered-content.ts for node and text-entry targets. Continuous national/regional readers compose VersionReader, ReaderArticle, ReaderComparison and ReaderDetails with route-owned Wiki and editorial slots. Country version, article and unit routes share `countries/[code]/versions/[versionId]/CountryConstitutionReader.tsx`; passage routes validate the unit and supply an initial target. An explicit paragraph/sentence hash takes precedence, and legacy article hashes resolve to the same article in the shared reader. lib/reader.ts handles comparison/presentation, reader-search.ts uses DOM ranges and CSS highlights, and reader-preferences.ts persists local reading choices. app/api/reader/compare/route.ts verifies same-constitution published snapshots before loading text; proxy.ts and Caddy retain browsing policy and quotas.

Contextual reader copying is owned by `lib/reader-actions.ts` and `ReaderActions.tsx`/`ReaderMenu.tsx`: actual source ancestry, original published text, and snapshot-pinned links. `FootnoteBacklinks.tsx` renders one return control, with a destination chooser for shared notes, while preserving authored note labels.

`ConstitutionDocument.tsx` and `ConstitutionDocument.module.css` own the document design shared by the public reader and editor Preview: type, measure, article headings/spacing, labels, tables and notes. Its defaults are defined once by the constitution tokens in `app/styles/tokens.css`. Use `ConstitutionText`, `ConstitutionArticleHeading` and `ConstitutionFootnotes` inside that surface. Keep toolbar/editor-shell rules in their host modules. Reading preferences supply `--constitution-font-size`; hosts may supply `--constitution-anchor-offset` for their sticky controls. Do not duplicate document typography in a host stylesheet. The same surface owns shallow hierarchy indentation and guide lines through `--constitution-hierarchy-inset`. `DocumentViewOptions.tsx` supplies shared conditional controls; `lib/reader-preferences.ts` keeps reader/Preview choices together and working-editor choices separate.

## Country and regional directories

`countries/[code]/page.tsx` loads national constitutions and the public jurisdiction descendants via `lib/country-directory.ts`. Each jurisdiction is read once, in batches of six; partial regional failures retain national and available regional content. `ConstitutionGroups` and `ConstitutionEntry` share legal-version selection, snapshot-pinned reading links, scoped comparison, version history and overview links across national, historical and regional collections. `CountryDirectory.module.css` separates section labels, jurisdiction headings and constitution titles. `ConstitutionDirectoryFrame` owns the Wiki panel and hideable contents for both country and jurisdiction pages. Current and former jurisdictions have explicit regional-page links; parent ancestry, historical status and recorded dates are displayed separately.

`layout/PageChrome.tsx` and its CSS module own the full-width shell, breadcrumbs, sticky menu, menu-item styling and contents navigation shared by `VersionReader`, country directories and regional directories. `usePageChromeMetrics` measures their actual header, menu and mobile navigation heights for sticky positioning and anchor offsets. Page-specific styles own content measures and reader/editor panels; do not copy the shared chrome back into host stylesheets.

Country and regional constitution overview routes share `ConstitutionOverview`; comparison routes share `countries/[code]/compare/ConstitutionComparison.tsx`. `CompareForm` accepts an owner action URL and an instance-specific ID prefix. Regional routes remain under `/jurisdictions/[id]`, and comparisons preserve exact published snapshots when changing the unchanged-passage filter.

`WikiPanel` owns the context heading, close control and actions shared by constitution, country and regional wikis. It sits after the sticky menu in normal page flow, without an internal scroll area. `directoryWikiPanel` in `DirectoryWiki` supplies published country/jurisdiction context with explicit Edit/Review wiki entry points. `WikiContent` shares summary, body, image placement, source rendering and typography across public wikis, editor previews and revision history. `WikiEditorTemplate` owns the editing fields, pictures, review/publication and history layout for both embedded and standalone editors. `WikiWorkspace` loads and authorizes all three wiki target types, then supplies data and commands to that template. `lib/wiki-routing.ts` preserves jurisdiction context and returns public directory links with `?wiki=1`. Wiki saves use the canonical target returned by Catalog for pinned media and never publish the draft as a side effect.

## Editor route orchestration

`app/editor/page.tsx` retains authentication, role gates and workspace routing.
`editor-page-state.ts` loads and derives the selected session state, while
`EditorSessionView.tsx` renders the existing page sections. Command POSTs enter
`app/editor/command/route.ts`; request/error utilities and amendment, draft,
source-evidence and publication handlers in that directory preserve native
redirects, JSON modes and trusted-origin guards.

## Outline editing and preview

`admin/constitutions/StructureWorkspaceTemplate.tsx` shares task navigation,
hierarchy, selected-level fields, presets and reader preview across creation,
existing settings and import setup approval. `OutlineEditor.tsx` retains creation
and Catalog impact/save commands; `admin/import/setup/SetupProposalReview.tsx`
retains display-only adjustments and Ingestion review commands. Workflow hosts
provide documents, source/identity and history. `outline-editor-model.ts` owns
graph updates, reachability/cycle checks and authoring validation.
`lib/constitution-templates.ts` supplies five editable preset graphs;
`lib/outline-preview.ts` builds modular examples without changing source samples.
Catalog remains the write authority. See `docs/design/constitution-structure-workspace.md`.

## Amendment and import workflow decomposition

`editor/DiffReviewQueue.tsx` separates its model hook from plain rendering helpers
to preserve state, focus and decision ordering. `editor/PublishForm.tsx` retains the
existing publication form and delegates focused request/details sections;
`editor/amendments/[id]/page.tsx` separates ordered review loading from notices and
body rendering. `editor/ChangeOverview.tsx` owns the unchanged rich preview descriptions.

`admin/import/page.tsx`, `admin/import/setup/SetupProposalReview.tsx` and
`admin/migrations/[id]/page.tsx` retain route authorization/loading and compose
focused presentation helpers. Setup actions separate intent validation and
display-save sequencing; `editor/ImportReview.tsx`
separates workflow, status and source sections. `lib/ingestion-api.ts` retains the
public transition client and delegates its existing error-code precedence.

## Reader, account and request helper boundaries

`components/ConstitutionText.tsx` separates body projection, ordered-group rendering,
rich marks and reference links while retaining the existing renderer exports.
`DiffConstitutionText.tsx` keeps stable/global pairing phases and rendered comparison order.
`ContentTranslation.tsx` separates DOM text selection, splitting, ordered batches
and application of translated values. `VersionReader.tsx` keeps state/effects in
its model hook and uses plain render helpers for the reader surface and controls.
`lib/reader-actions.ts` and `lib/reader-search.ts` preserve exact copied text and
UTF-16 DOM-range offsets. Country reader and comparison routes retain ordered
loading, snapshot pins and optional-service error boundaries.

Account, legal, login/MFA, home, header and Wiki/editor workspaces retain their
existing route and component owners. Focused helpers separate loading, policy,
selection and form sections without adding React boundaries around their state.
`proxy.ts` separates request admission while retaining setup, browsing, credential
and CSP ordering; `api/edge-rate-limit/route.ts` keeps the existing quota keys,
credential precedence and response headers.

## Fixture and browser-test helpers

`e2e/mock-api.mjs` remains the mock server entry point. `e2e/mock-api/routes.mjs`
retains route precedence; domain `*-routes.mjs` modules handle selected requests,
and `state.mjs` owns shared fixtures, reset behavior and HTTP/body helpers. Early
scenario interception and synchronous fallthrough remain explicit.
`route.mjs` shares only literal method/path gates, preserving synchronous misses
and selected response/context/Promise identity; stateful and regex gates stay explicit.

`e2e/fixtures/ui-review.mjs` owns fixture-instance UI state, responses and setup
proposal writes. `prepopulate.mjs` separates version preparation/publication checks;
`scenarios/index.mjs` retains dependency dispatch, access/search verification and
journal/guide ordering. Browser helpers in `templates.spec.ts`, `ui-review.spec.ts`
and `full/legacy-migration.spec.ts` preserve assertions and test registration.
`e2e/mock-api-contract.test.mjs` supplies focused real-HTTP contracts in the gateway
Node test commands; UI response contracts run through Vitest.
Pre-launch routing aliases (`/legacy`, country `constitution-timeline`, `/admin/import/[jobId]`, generic `/versions/[versionId]/units/[unitId]`) are retired. Their source and former behavior live in `archive/legacy-routing/`, outside every build context. Passage links point directly to the owning country/jurisdiction reader with an occurrence fragment.

## Amendment workspace and document evidence

`app/documents/page.tsx` authenticates the central library;
`DocumentLibrary`, `DocumentInspector` and `BibtexImport` own its responsive
folder/list/details UI. `app/documents/command/route.ts` owns trusted-origin
mutations, bounded search, exact file downloads and complete folder/selection
exports. `DocumentDetailsDrawer` owns the resizable bottom drawer and retained
drafts; `DocumentExport` offers bibliography-only and ZIP downloads in each scope.
`lib/document-api.ts` supplies server-only HTTP clients and shared types;
`document-library-messages.ts` owns localized chrome. Navigation uses
`canReadDocuments`/`canManageDocuments`; publishers/reviewers cannot edit. Legacy
editorial document pages redirect; public `/documents/[id]` retains pinned reads.

`editor/amendments/AmendmentForm` owns task navigation, the single constitution-wide version pair, visible public comment and the mounted draft form. `AmendmentChangesTable` navigates recorded passages; `editor/PassageComparison` shares bounded wording comparison with DiffReviewQueue. Source formatting uses OrderedContentTree inside ConstitutionDocument. AmendmentEditorLayout keeps historical inspection separate from the current form; revision attachments are loaded read-only.

`editor/documents/DocumentManagerTemplate` owns the shared upload/select interface in constitution configuration, continuous editing and amendments. DocumentLinks loads authorized initial data; DocumentManager updates attachment state without navigation. The gateway endpoint is `/editor/documents/command` (GET history links, POST document commands); `/api/editor/*` belongs to editor-service through Caddy. Document-service owns the transactional create/upload/attach endpoint and actor-scoped retry receipt. Saving an amendment uses the existing command endpoint with a JSON outcome so rejected saves retain entered values; native POST redirects remain supported.

## Constitution history viewers

`components/history/` owns the shared public History, amendment, lifecycle and consolidated comparison shell. A constitution's country/regional route opens History; `?view=wiki` opens its Wiki panel. Record routes live under that constitution's `/amendments/[amendmentId]` and `/events/[eventId]`. The old standalone amendment register and duplicate overview component are retired. `lib/constitution-viewer.ts` validates URL reading context and return links; `constitution-history.ts` filters published records by stable passage identities. `lib/consolidated-comparison.ts` derives net passage results from endpoint snapshots and associates published amendment provenance, including reversed/intermediate-only changes. `RecordMaterials` uses Document's independent scoped, revisioned material links via the trusted-origin `/api/record-materials` command. Lifecycle evidence corrections remain Publisher/Admin commands and append evidence revisions without changing legal event dates or types.
