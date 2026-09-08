<!-- Generated: 2026-09-06 | Files scanned: ~250 | Token estimate: ~800 -->
# Frontend (`apps/gateway-web`)

Next.js 15 App Router, React 18, TypeScript. **No DB** — HTTP clients only. Prefer server components; client components for editor widgets.

**Rules:** `apps/gateway-web/AGENTS.md`, `.cursor/rules/nextjs-gateway.mdc`  
**Design:** `docs/design/ui-concept.md`, tokens in `app/globals.css` (from `docs/design/tokens.css`)  
**Nav by role:** `docs/design/role-link-trees.md` + `lib/nav.ts`

## Page tree (`app/`)

| Route | File |
| --- | --- |
| `/` | `page.tsx` (home: hero, country cards, recently changed) |
| `/search` | `search/page.tsx` |
| `/countries/[code]` | `countries/[code]/page.tsx` |
| `/countries/[code]/compare` | `…/compare/page.tsx` + `CompareForm.tsx` + `CompareView` / `Tabs` |
| `/countries/[code]/timeline` | `…/timeline/page.tsx` |
| `/countries/[code]/versions/[versionId]` | `…/versions/[versionId]/page.tsx` |
| `…/articles/[articleId]` | article permalink |
| `/about` | static sources / verification / accessibility |
| `/login`, `/login/mfa` | login + MFA |
| `/reset`, `/invite` | password reset, invite accept |
| `/account`, `/account/step-up` | self-service + MFA step-up |
| `/editor` | drafts (`ArticleEditor.tsx`, `ArticleFilterList`, `WorkflowSteps`, `actions.ts`) |
| `/admin` | admin index (Users, Outlines, Import) |
| `/admin/users` | identity admin |
| `/admin/constitutions`, `/admin/constitutions/[id]` | outlines |
| `/admin/import`, `/admin/import/[jobId]` | ingestion |

Shell: `layout.tsx` → skip link + `SiteHeader` + `SiteFooter`. Shared UI: `app/components/` (`ConstitutionText`, `DiffConstitutionText`, `VersionReader`, `ui.tsx`, `MenuDisclosure`, `Segmented`, `Tabs`, `Toc`, `FiltersPanel`, `ArticleFilterList`). Nav: `lib/nav.ts` (`primaryNavLinks`, `menuSections`). Home/country helpers: `lib/reading.ts`.

Admin gates: `lib/admin.ts` (`requireAdminPage`). Editor/admin links: `lib/nav.ts` (UI only).

## Clients (`lib/`)

| Module | Talks to |
| --- | --- |
| `api.ts` | catalog, content, amendment, search (`CATALOG_API_URL` …) |
| `identity-client.ts` + `session.ts` | identity; cookies `ca_session`, `ca_mfa_challenge` |
| `editor-api.ts` | editor-service (`searchIndexStatus` on preview after publish) |
| `ingestion-api.ts` | ingestion |
| `outline.ts` | render groups from catalog outline + content nodes |
| `compare.ts`, `text-diff.ts` | compare page |
| `timeline.ts`, `provenance.ts` | timeline + source badges |
| `create-constitution.ts` | admin create flow |
| `contracts/` | CAT-2 / CNT-2 / identity JSON fixtures (QLT-3) |

Server actions live next to pages (`login/actions.ts`, `editor/actions.ts`, `admin/*/actions.ts`, `account/actions.ts`).

Env in Compose: `CATALOG_API_URL=http://catalog-service:8080` (service root, not `/api/catalog`). Local fallback in `api.ts` uses `http://localhost/api/…`.

## Tests

| Kind | Command / location |
| --- | --- |
| Unit | `npm test` — vitest on `lib/*.test.ts` + `lib/interpret-me.test.cjs` |
| Lint/build | `npm run lint`, `npm run build` |
| E2E | `npm run test:e2e` — `e2e/journeys.spec.ts`, `a11y.spec.ts`, `visual.spec.ts` |
| Snapshots | `e2e/snapshots/` Linux Chromium `mcr.microsoft.com/playwright:v1.51.1-jammy` |

Journeys: browse DE article, search “dignity”, compare, MFA login, edit→review→publish.

`middleware.ts` sets a per-request CSP nonce (`script-src 'self' 'nonce-…' 'strict-dynamic'`, `frame-ancestors 'none'`). Styles still allow `'unsafe-inline'` until App Router emits style nonces. Swagger is Caddy `/api/docs/<service>/swagger-ui/index.html`, not a Next route (`nav.ts` may link `/api-docs` for admins).
