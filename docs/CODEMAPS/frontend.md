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
