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
| Public discovery/reading | `app/page.tsx`, `search/`, `countries/[code]/`, `versions/[versionId]/units/[unitId]/` |
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

The active canvas is app/editor/StructuredEditor.tsx with ContinuousCanvas.tsx (ProseMirror), compact-editor.module.css and lib/continuous-editor.ts. EditorWorkspace.tsx owns hideable navigation and workflow disclosure; ChangeOverview.tsx presents readable differences. The authenticated editor/view projection returns a pinned global note/reference index, lazy root bodies, or the full body only for explicit Preview.

Shared app/components/Footnotes.tsx and InlineText.tsx render note drawers and structured marks in editing, reading and comparison. lib/footnotes.ts indexes a pinned version once; lib/draft-footnotes.ts indexes draft notes before lazy projection. Readers use lib/ordered-content.ts for node and text-entry targets. Continuous national/regional readers compose VersionReader, ReaderArticle, ReaderComparison and ReaderDetails with route-owned Wiki and editorial slots. Country version, article and unit routes share `countries/[code]/versions/[versionId]/CountryConstitutionReader.tsx`; passage routes validate the unit and supply an initial target. An explicit paragraph/sentence hash takes precedence, and legacy article hashes resolve to the same article in the shared reader. lib/reader.ts handles comparison/presentation, reader-search.ts uses DOM ranges and CSS highlights, and reader-preferences.ts persists local reading choices. app/api/reader/compare/route.ts verifies same-constitution published snapshots before loading text; proxy.ts and Caddy retain browsing policy and quotas.

Contextual reader copying is owned by `lib/reader-actions.ts` and `ReaderActions.tsx`/`ReaderMenu.tsx`: actual source ancestry, original published text, and snapshot-pinned links. `FootnoteBacklinks.tsx` renders one return control, with a destination chooser for shared notes, while preserving authored note labels.

`ConstitutionDocument.tsx` and `ConstitutionDocument.module.css` own the document design shared by the public reader and editor Preview: type, measure, article headings/spacing, labels, tables and notes. Its defaults are defined once by the constitution tokens in `app/styles/tokens.css`. Use `ConstitutionText`, `ConstitutionArticleHeading` and `ConstitutionFootnotes` inside that surface. Keep toolbar/editor-shell rules in their host modules. Reading preferences supply `--constitution-font-size`; hosts may supply `--constitution-anchor-offset` for their sticky controls. Do not duplicate document typography in a host stylesheet.

## Country and regional directories

`countries/[code]/page.tsx` loads national constitutions and the public jurisdiction descendants via `lib/country-directory.ts`. Each jurisdiction is read once, in batches of six; partial regional failures retain national and available regional content. `ConstitutionGroups` and `ConstitutionEntry` share legal-version selection, snapshot-pinned reading links, scoped comparison, version history and overview links across national, historical and regional collections. `CountryDirectory.module.css` separates section labels, jurisdiction headings and constitution titles. `ConstitutionDirectoryFrame` owns the Wiki panel and hideable contents for both country and jurisdiction pages. Current and former jurisdictions have explicit regional-page links; parent ancestry, historical status and recorded dates are displayed separately.

`layout/PageChrome.tsx` and its CSS module own the full-width shell, breadcrumbs, sticky menu, menu-item styling and contents navigation shared by `VersionReader`, country directories and regional directories. `usePageChromeMetrics` measures their actual header, menu and mobile navigation heights for sticky positioning and anchor offsets. Page-specific styles own content measures and reader/editor panels; do not copy the shared chrome back into host stylesheets.

Country and regional constitution overview routes share `ConstitutionOverview`; comparison routes share `countries/[code]/compare/ConstitutionComparison.tsx`. `CompareForm` accepts an owner action URL and an instance-specific ID prefix. Regional routes remain under `/jurisdictions/[id]`, and comparisons preserve exact published snapshots when changing the unchanged-passage filter.

`WikiPanel` owns the context heading, close control and actions shared by constitution, country and regional wikis. It sits after the sticky menu in normal page flow, without an internal scroll area. `directoryWikiPanel` in `DirectoryWiki` supplies published country/jurisdiction context with explicit Edit/Review wiki entry points. `WikiContent` shares summary, body, image placement, source rendering and typography across public wikis, editor previews and revision history. `WikiEditorTemplate` owns the editing fields, pictures, review/publication and history layout for both embedded and standalone editors. `WikiWorkspace` loads and authorizes all three wiki target types, then supplies data and commands to that template. `lib/wiki-routing.ts` preserves jurisdiction context and returns public directory links with `?wiki=1`. Wiki saves use the canonical target returned by Catalog for pinned media and never publish the draft as a side effect.
