<!-- Generated: 2026-09-06 | Files scanned: ~250 | Token estimate: ~950 -->
# Backend

Package `com.constitutionatlas.<short>`. Layers: Controller → Service → `JdbcTemplate` repo. Public JSON = DTOs. Each service: `GET /ping`, actuator `/actuator/health` + `/info`, `X-Correlation-Id`.

Paths below are **service paths**. Public: prefix `/api/<short>`.

## catalog — `services/catalog-service`

`api/CatalogController.kt` → `CatalogQueryService` / `CatalogWriteService` → `CatalogRepository`

| Method | Path |
| --- | --- |
| GET | `/countries`, `/countries/{isoCode}` |
| GET | `/constitutions/{id}/versions`, `/versions/{id}`, `/constitutions/{id}/content-outline` |
| PUT | `/constitutions/{id}/content-outline` |
| POST | `/countries`, `/countries/{iso}/constitutions`, `/constitutions/{id}/versions` |
| POST | `/versions/{id}/publish` |

Tests: `CatalogApiTest.kt`. Seed DE: `V3__seed_germany.sql`.

## content — `services/content-service`

`api/ArticleController.kt` → `ArticleQueryService` → `ArticleRepository` (SQL only)

| Method | Path |
| --- | --- |
| GET | `/versions/{id}/articles?offset&limit&includeBody` (`X-Total-Count`) |
| PUT | `/versions/{id}/articles` (replace; optional client `id` / `predecessorId`) |
| GET | `/articles/{id}` |
| PATCH | `/articles/{id}`, `/nodes/{id}` |
| POST | `/versions/{id}/restructure` |

Tree in `content_nodes` is the only write model; `articles` is a view of roots. Latest Flyway: V7.

## amendment — `services/amendment-service`

`AmendmentController` → `AmendmentService` → `AmendmentRepository`  
Clients: identity (mutating Bearer), content (`includeBody=true` trees), catalog (`constitutionId`).

| Method | Path |
| --- | --- |
| GET | `/versions/{id}/amendments?sourceVersionId` |
| GET | `/amendments?constitutionId&articleNumber` |
| POST | `/transitions` (editor/publisher/admin or `content:write`; computes added/changed/removed) |

## identity — `services/identity-service`

`AuthController` + `AccountController` → `AuthService` / `AccountService` / `MfaService` / `ServiceTokenService` → `IdentityRepository`  
Clients: `client/AuditClient.kt`. Seed: `IdentitySeedRunner`. Prod guard: `ProductionIdentityGuard`.

| Area | Paths |
| --- | --- |
| Session | `POST /login`, `/login/mfa`, `/logout`; `GET /me`; sessions CRUD |
| MFA | `/mfa/enroll/start`, `/confirm`, `/step-up`, `/recovery/regenerate`; `DELETE /mfa` |
| Account | `POST /password/change`, `/password/reset`, `/password/reset/confirm`, `/invites/accept` |
| Admin | `/users`, invites, enable/disable, `PUT /users/{id}/roles`, password-resets |
| Tokens | `/service-tokens` GET/POST, `POST /service-tokens/{id}/rotate`, `DELETE /service-tokens/{id}` |

Bearer `Authorization`. Tests: `IdentityApiTest.kt`.

## editor — `services/editor-service`

`EditorController` → `EditorService` → `EditorRepository`  
Clients: identity, catalog, content, amendment, search, audit. Publish copies onto a new catalog version (ADR 0002), writes editor `outbox_events` (ADR 0003), and a scheduler delivers `search.reindex-requested`.

Flow: `POST /edit-sessions` → `/saves` → `/review` → `/approval` → `/publish`  
Session `status` is `EditSessionStatus` (`open`/`reviewing`/`approved`/`published`).  
Preview JSON includes `searchIndexStatus` (`pending`/`ready`/`failed`) after publish.  
`GET /edit-sessions` = list (status, openedBy, versionId; `openedBy=me`)  
`GET /edit-sessions/{id}` = preview. Roles enforced in service, not Spring Security.

## search — `services/search-service`

`SearchController` → `SearchIndexService` → `SearchRepository`  
`GET /search?q&country&versionId&effectiveDate&limit&offset`  
`GET /search/facets`  
`POST /reindex`  
Source: `client/RestIndexSource.kt`.

## ingestion — `services/ingestion-service`

`ImportController` → `ImportService` + `ImportValidator` → `ImportJobRepository`  
`POST /import-jobs`, `GET /import-jobs/{id}`  
Writes catalog then content (`ImportService.persist`).

## audit — `services/audit-service`

`POST /events` append; `GET /events?entityType&entityId`  
PUT/PATCH/DELETE → 405; DB rules block update/delete.

## Shared conventions

- Shared Kotlin module: `services/platform` (`com.constitutionatlas:platform:0.1.0`). Each service `includeBuild("../platform")`. It owns `CorrelationIdFilter` (SEC-9 allow-list), `NotFoundException` / `UnauthorizedException` / `ForbiddenException` + `ProblemAdvice`, and the identity Bearer `IdentityClient`. Do not copy those into a service.
- New service: copy a sibling for Gradle/Docker layout (`.cursor/skills/new-kotlin-service`), then depend on platform.
- Gradle: `gradle/service-conventions.gradle` (Spotless/ktlint, `bootJar` → `app.jar`).
- Tests: Testcontainers `postgres:16-alpine`; extend `SmokeTest` unless isolation is required.
- Run: `cd services/<name> && ./gradlew test` (wrapper **9.7.1**).
