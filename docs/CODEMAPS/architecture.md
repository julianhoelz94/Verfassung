<!-- Generated: 2026-09-06 | Files scanned: ~250 | Token estimate: ~850 -->
# Architecture

**Entry:** `docker-compose.yml`, `infra/caddy/Caddyfile`, `apps/gateway-web`, `services/*`  
**Decision:** `docs/adr/0001-platform-boundaries.md`

```
Browser ──► Caddy :80
              ├─ /api/docs/<svc>*  ► <svc>:8080  (springdoc, X-Forwarded-Prefix)
              ├─ /api/<svc>*       ► <svc>:8080  (strip /api/<svc>)
              └─ *                 ► gateway-web:3000
                                      │  SSR / server actions
                                      ▼
                    catalog  content  amendment  identity
                    editor   search   ingestion  (audit via identity/editor)
```

Eight Spring Boot apps, each with its own Postgres. Gateway has **no database**. Search and audit are derived.

## Ownership

| Service | Writes (only here) | Derived? |
| --- | --- | --- |
| catalog | countries, constitutions, versions, sources, outlines | no |
| content | articles, `content_nodes` tree | no |
| amendment | transitions, amendments, revisions, changes | no |
| identity | users, roles, sessions, MFA, invites, service tokens | no |
| editor | edit sessions, draft changes, revisions; **commands** publish | no |
| search | `search_documents` index | yes — rebuilt from catalog+content |
| ingestion | import jobs / staging; then HTTP writes to catalog+content | job rows only |
| audit | `audit_events` append | yes — not article text |

`version_id` / `article_id` are **opaque UUIDs copied across services**, not FKs.

## Two URL shapes (easy to mix up)

| Who | Catalog list countries |
| --- | --- |
| Browser via Caddy | `http://localhost/api/catalog/countries` |
| Compose / gateway env | `http://catalog-service:8080/countries` (no `/api/catalog` prefix) |
| Host without Compose | `http://localhost/api/catalog` is the gateway default in `lib/api.ts` |

Controllers map paths at the **service root** (`GET /countries`), not under `/api/…`.

## Request traces

**Public read (home → article)**  
Caddy → `gateway-web` page → `lib/api.ts` → catalog `GET /countries/{code}` → content `GET /versions/{id}/articles` → render `ConstitutionText`.

**Login**  
`app/login/actions.ts` → `lib/session.ts` → identity `POST /login` → cookie `ca_session` (Bearer token). MFA uses `ca_mfa_challenge`.

**Publish draft**  
Editor UI → editor `POST /edit-sessions/{id}/publish` → identity `/me` (role + step-up) → content copy onto a new catalog version (CAT-5 predecessor + hop kind) → catalog `POST /versions/{id}/publish` → editor `outbox_events` (`version.published`, `search.reindex-requested`) → scheduler `POST` search `/reindex`. Audit `POST /events` is still best-effort HTTP. Until ED-6, editor may still `POST /transitions`; that does not make every hop a public law (ADR 0004).

**Import**  
Admin → ingestion `POST /import-jobs` → catalog create country/constitution/version → content `PUT /versions/{id}/articles` → catalog `POST /versions/{id}/publish`.

## Cross-service HTTP (no SQL)

| From | Calls |
| --- | --- |
| gateway-web | all public APIs (server-side) |
| editor | identity `/me`, catalog create+publish, content replace/patch, amendment `/transitions`, audit `/events`; search `/reindex` via outbox scheduler |
| identity | audit `/events` |
| ingestion | catalog + content writes |
| search | catalog + content reads (reindex on startup if `SEARCH_REINDEX_ON_STARTUP`) |

## Auth model

No Spring Security filter chain. Identity hashes session tokens. Editor enforces roles in `EditorService` after `IdentityClient.authenticate`. Gateway **hides** buttons (`lib/nav.ts`); that is not authorization. Catalog/content/amendment/search/ingestion HTTP APIs are reachable on `/api/…` without a session today.

Roles: `docs/editorial-roles.md`. Publish requires publisher/admin **and** fresh MFA step-up.
