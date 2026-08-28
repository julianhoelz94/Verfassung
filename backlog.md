# Constitution Atlas Backlog

## Product Goal
Build a public website that hosts constitutions from many countries, supports multiple official versions per constitution, and preserves article-level history and amendments in a structured, searchable way.

## Product Outcomes
- A visitor can browse any supported country and reach a constitution version in a few clicks.
- An editor can log in, edit constitutional content in a WYSIWYG interface, preview it, and publish it safely.
- Every published text can be traced back to its source, version history, and amendment trail.
- The platform can be maintained without a monolithic release process or direct database coupling between services.
- Editing does not need real-time collaboration, but every change must be versioned and reviewable later.

## Product Principles
- Store constitutions as versioned documents, not as mutable single blobs.
- Keep each article independently addressable.
- Preserve amendment history without losing prior text.
- Make citations and source provenance first-class data.
- Design for future translation, comparison, and analysis features.
- Keep the public experience simple and fast, even when internal modeling is rich.
- Prefer stable identifiers over implied ordering where possible.
- Make every write path auditable and every change reversible when practical.
- Default to explicit schemas, API contracts, and domain commands instead of generic pass-through logic.
- Optimize for future editorial maintenance as much as for initial delivery.
- Prefer single-editor-at-a-time drafts over simultaneous collaborative editing unless a future need proves otherwise.

## Delivery Constraints
- The system should be organized as microservices rather than a single monolith.
- Each microservice should own its own database if it requires persistent state.
- The local development environment must be startable with a `docker-compose` setup.
- CI must run the test suite automatically on every push.
- Shared contracts between services should be explicit and versioned.
- No service should depend on another service's database schema directly.
- External write actions should always go through the owning service or an approved tool gateway.
- The editor and MCP server should only expose scoped actions that can be logged and audited.
- Long-running or risky platform actions should be asynchronous when that reduces user impact.

## Proposed Service Boundaries
- `gateway-web`: public website and SSR or frontend delivery, implemented with React and Next.js.
- `catalog-service`: countries, constitutions, and version metadata.
- `content-service`: article text, article ordering, and article-level navigation.
- `amendment-service`: amendments, diffs, and historical change tracking.
- `search-service`: full-text search and discovery indexes.
- `ingestion-service`: import pipelines, validation, and editorial workflows.
- `editor-service`: authenticated WYSIWYG editing, content manipulation, and editorial publishing actions.
- `admin-service`: moderation, review, and operational tools if needed.
- `identity-service`: authentication, authorization, and user accounts if the platform ever needs editorial access.
- `translation-service`: language variants, translation workflow, and localization metadata.
- `citation-service`: canonical references, source documents, and stable citation formatting.
- `notification-service`: email or in-app notifications for editorial review, import failures, and dependency updates.
- `backup-service`: scheduled backups, restore automation, retention enforcement, and recovery verification.
- `audit-service`: immutable audit trail for content edits, imports, approvals, and operational changes.
- `document-processing-service`: parsing, normalization, OCR, and text extraction for source documents.
- `metrics-service`: product analytics, usage reporting, and platform-level operational summaries.
- `mcp-server`: model context protocol server for safe tool-based access to approved platform capabilities.
- `edge-proxy`: reverse proxy and local webserver container for routing traffic to the gateway, docs, and supporting services.

### Why these boundaries exist
- The public site should stay lightweight and serve only presentation and read-only composition concerns.
- Metadata changes move faster than article text, so `catalog-service` should be separate from `content-service`.
- Amendment history deserves its own model because legal change tracking is richer than content storage.
- Search should be a derived read model so indexing can be rebuilt without losing authority.
- The editor must be isolated from public browsing so write flows remain deliberate and auditable.
- The MCP server should be treated as a controlled integration surface, not as a generic admin backdoor.
- The edge proxy should be the single local entry point so developers can reach the public site, API docs, and supporting tools from one URL.

## Core Services for First Phase
These are the services we should build first because they contain the platform's essential functionality.

- `gateway-web`: public reading experience, country listings, version views, article detail pages, and editor entry points.
- `identity-service`: editor login, authentication, role-based access, session handling, and permission checks.
- `editor-service`: WYSIWYG editing, draft management, content manipulation, preview, save, discard, submit, and publish actions.
- `catalog-service`: country, constitution, version metadata, publication status, source references, and canonical navigation lists.
- `content-service`: article storage, ordering, retrieval, stable article identifiers, and versioned article snapshots.
- `amendment-service`: version history, amendment records, change summaries, and transitions between published versions.
- `search-service`: keyword search, filtering, derived indexes, and search result ranking for public discovery.
- `ingestion-service`: importing, validating, normalizing, and staging source texts before publication.
- `audit-service`: immutable tracking of changes, imports, approvals, editor actions, and operational actions.

### Core launch expectations
- Each core service should expose a health endpoint, a minimal read API, and a clear write boundary if it owns state.
- Each core service should have at least one integration test that proves the service can talk to its own database.
- Public content pages should not require direct access to any write service.
- The editor path should be available behind login before any public publishing workflow is considered complete.

## Optional Services for Later Phases
These are useful, but they should stay out of the initial implementation scope unless a strong need appears.

- `admin-service`: moderation, review, operational tools, and manual intervention screens.
- `translation-service`: language variants, translation workflow, and localization-specific publication rules as a later add-on.
- `citation-service`: canonical references, source document records, and citation formatting helpers.
- `notification-service`: review notifications, import alerts, dependency update alerts, and operational messaging.
- `backup-service`: backups, restore verification, retention policies, and recovery tooling.
- `document-processing-service`: OCR, parsing, normalization, and source extraction pipelines.
- `metrics-service`: product analytics, operational reporting, and usage summaries.
- `mcp-server`: tool gateway for assistants and automation clients once the editor and content models are stable.
- `edge-proxy`: local reverse proxy and webserver container for development routing, API docs, and future TLS termination.

## Data Ownership Rules
- A service may read another service's data only through an API or event contract, not by direct database access.
- Writes must go to the owning service only.
- Cross-service joins should be handled by API composition or read models.
- If a service does not need persistent state, it should remain stateless.
- Search indexes should be treated as derived data, not the source of truth.
- Use the outbox pattern for any event that must not be lost after a database commit.
- Treat write models and read models as different concerns, even when they live in the same service.
- Keep ownership boundaries visible in code, schema names, and API documentation.
- Do not reuse internal persistence entities as public API contracts.

## Technology Stack
- Backend services: Kotlin with Spring Boot.
- Backend structure: Controller, Service, Repository, and DTO layers, with domain logic kept out of controllers.
- Frontend: TypeScript with React and Next.js.
- Local orchestration: `docker-compose` for all services and databases needed in development.
- CI/CD: push-triggered pipeline that runs tests, builds service images, and validates the frontend.
- Optional async integration: event-driven messaging between services where it improves decoupling.
- Database layer: PostgreSQL, with JSONB only for flexible metadata or transient editor payloads.
- API style: REST plus OpenAPI for synchronous calls, with events for cross-service propagation.
- Rich-text editing: structured editor model rather than raw HTML, with a deterministic server-side renderer.
- Tooling: Renovate for dependency updates, linting and static analysis in CI, and Docker for local reproducibility.
- Edge proxy: Caddy as the preferred reverse proxy/webserver container for local development, with Nginx or Traefik as acceptable alternatives.

## Local Test Strategy

## Local API GUI
- Provide Swagger UI or an equivalent OpenAPI browser for each service so APIs can be tested manually without writing code.
- Expose the GUI locally through the gateway or through individual service endpoints, whichever keeps the developer workflow simplest.
- Generate OpenAPI specs from the Kotlin backend so the documentation and the actual controllers stay aligned.
- Include request examples, response examples, and authentication instructions in the API docs.
- Keep the GUI read-only for browsing until the user authenticates, then allow authorized editor actions through the same interface.
- Use the GUI for quick manual verification of login, draft creation, preview, publish, search, and import flows.
- Make the GUI reachable in `docker-compose` so the full local stack can be exercised from one browser session.
- Prefer one central entry point for documentation if that is simpler, but allow service-specific docs when the APIs differ a lot.

## Release and Environment Strategy

### `local-stack`
- Purpose: day-to-day development, manual API testing, and feature work.
- Data policy: disposable data, fast resets, and seed content for development.
- Access: local developer credentials only.
- Test users:
	- `local-admin`: full local admin and maintenance access.
	- `local-editor`: editor plus review/publish access for manual workflow testing.
	- `local-viewer`: read-only account for public-site checks.
- Notes: this profile should always include the API GUI, the edge proxy, and seed constitutional content.

### `ci`
- Purpose: automated verification on every push and pull request.
- Data policy: ephemeral databases and deterministic seed data.
- Access: machine credentials only.
- Test users:
	- `ci-bot`: automated login for smoke checks and service-to-service tests.
	- `ci-viewer`: read-only account for end-to-end verification where a human account is required.
	- `ci-editor`: scripted editor account for API and UI workflow tests.
- Notes: the CI profile should run unit, integration, contract, and a minimal end-to-end suite.

### `testing`
- Purpose: staging-like validation before release and manual QA.
- Data policy: resettable but closer to production behavior, with production-like configuration.
- Access: limited human access plus test automation credentials.
- Test users:
	- `test-admin`: full access for QA and operational checks.
	- `test-editor`: editor and review/publish access for acceptance testing.
	- `test-viewer`: public browsing account for regression testing.
- Notes: this profile should mirror production routing, auth, and observability as closely as practical.

### `production`
- Purpose: public live environment.
- Data policy: durable data, backups, retention, and controlled change management.
- Access: tightly restricted operational credentials only.
- Test users:
	- `prod-admin`: break-glass administrative access, kept private and audited.
	- `prod-smoke-editor`: locked-down account for post-deploy smoke checks, if needed.
	- `prod-viewer`: public read-only access through normal anonymous browsing.
- Notes: production should not contain everyday test users; only tightly controlled smoke or break-glass accounts if a manual verification workflow requires them.

### Release flow
- Changes are developed and manually tested in `local-stack`.
- Automated checks run in `ci` on every push.
- Acceptance and release candidate validation happen in `testing`.
- Only approved releases are promoted to `production`.
- Environment-specific credentials, URLs, and feature flags should be stored separately for each profile.
- The same seeded constitutional corpus should be available in local, CI, and testing profiles to keep results comparable.

### Promotion rules
- Configuration changes may be promoted independently from application code only when they do not change behavior.
- Database migrations must be validated in `testing` before `production` promotion.
- Any change to auth, editor workflows, or import pipelines should include a smoke test in all four profiles.
- The API GUI should be available in every profile, but the production instance should expose only the safe, intended surface area.

## Logging Strategy
- Use structured JSON logs in every service and every environment so logs can be filtered, queried, and aggregated consistently.
- Keep JSON as the canonical log format; if developers want more readable output locally, use a viewer or formatter outside the application.
- Include a correlation ID, request ID, user ID or service identity, environment name, and service name on every log line.
- Log at different levels for different signals: `info` for expected lifecycle events, `warn` for recoverable problems, and `error` for failed operations.
- Avoid logging secrets, tokens, passwords, full request bodies, or personally sensitive content.
- Log editor actions, publish actions, import actions, authentication events, and backup operations as explicit business events.
- Keep audit history in the `audit-service` and operational logs in the logging system; do not mix the two concerns.
- Emit one log entry for the start and one for the completion of long-running jobs, with a job identifier linking them.
- Add request timing, response status, and downstream dependency timing so slow paths are easy to diagnose.
- Use the same log schema in `local-stack`, `ci`, `testing`, and `production`, but keep retention and verbosity lower in production if needed.
- Forward logs from containers to a central collector or log sink so the full stack can be searched from one place.
- Make stack traces and exception details available for failures, but only in a sanitized form that does not expose secrets.
- Include action-specific metadata for imports, publishes, approvals, and migrations so operational debugging is faster.

## Infrastructure Services
- Use an edge proxy such as Caddy, Nginx, or Traefik as the first container that developers and later users hit.
- Route public traffic to `gateway-web`, API traffic to the backend services, and documentation traffic to the OpenAPI UI.
- Keep the proxy configuration explicit and versioned so service routes do not drift.
- Use the backup service to run scheduled backups, verify restore ability, and enforce retention windows.
- Store backup artifacts in a durable object store or backup volume rather than inside application containers.
- Treat restore verification as a routine check, not only as a disaster-response activity.

- Add Swagger UI or an equivalent OpenAPI browser to each backend service or to a central gateway view.
- Verify that authentication flows work from the API GUI before the frontend is built.
 - Use domain events for cross-service state propagation, such as article published, amendment created, import completed, or draft submitted.
 - Publish events through the outbox pattern so database commits and event delivery stay consistent.
 - Make event consumers idempotent so retries do not create duplicate side effects.
 - Keep service-to-service payloads small and explicit, with versioned schemas and stable field names.
 - Use correlation IDs and trace IDs across services so a single user action can be followed end to end.
 - Prefer API composition in the gateway over chatty service-to-service calls when building public pages.
 - Keep read models synchronized from events rather than from direct database access.
 - Introduce a single message broker only if the event flow justifies it; do not make every service depend on asynchronous messaging by default.
- Model published content and draft content separately when editor workflows need previews or moderation.
- Use immutable version rows for published constitutional snapshots so historical references never drift.
- Add uniqueness constraints where legal text depends on stable numbering or official naming.
 - `mcp-server`: tool gateway for assistants and automation clients once the editor and content models are stable.
- Prefer foreign keys inside a service where referential integrity matters for published records.
- Use soft deletion only when the domain requires recoverable history; otherwise keep old rows immutable and supersede them.

## Core Service Schema Outline

### `catalog-service`
- `countries`: canonical country records and ISO codes.
- `constitutions`: one row per constitution family.
- `constitution_versions`: version labels, effective dates, publication status, and source references.
- `constitution_sources`: official links, gazette references, archival references, and import provenance.

### `content-service`
 - Implement `mcp-server` as a read-only tool gateway for inspecting the old and new content models.
 - Expose only explicit, whitelisted read tools for browsing content, checking mappings, and verifying import results.
 - Log every tool invocation to the audit trail with request metadata and actor identity.
 - Add tool-level rate limits and scope restrictions so automation stays controlled.
 - Keep the MCP surface narrow until the underlying services are stable.
 - Use the MCP server later to transport constitutional texts from the old HTML website into the new platform under controlled migration commands.
 - Add request validation and schema checks so tool inputs cannot bypass normal domain constraints.
 - Keep the first MCP version intentionally read-only, with write support deferred until the migration workflow is ready.
- `articles`: article number, title, order, and version linkage (current snapshot; later a view over tree nodes).
- `content_nodes` (ARCH-5): flexible tree per version; node `kind` constrained by the constitution’s outline in catalog.
- `constitution_outlines` (catalog, ARCH-5): per-constitution node kinds and allowed parent/child relations.
- `article_content_revisions`: editor-friendly rich-text payloads and published snapshots.
- `article_links`: explicit cross-references between articles when the source text refers to other provisions.

### `amendment-service`
- `amendments`: amendment metadata, dates, and source references.
- `amendment_changes`: one row per affected content node (article or any descendant).
- `version_transitions`: links between old and new constitution versions.
 - Prefer a small number of backend calls per page and fetch aggregates from the gateway instead of chaining through the UI.
- `change_summaries`: human-readable summaries of what changed and why.

### `identity-service`
- `users`: editor and admin accounts.
- `roles`: role definitions, including a combined `editor-review-publish` role.
- `user_roles`: role assignments.
- `sessions` or `tokens`: authenticated session state if needed.
 - Publish a version-created or version-published event when metadata changes should update downstream read models.
- `password_resets` or `invites`: optional onboarding and recovery flows if the platform needs them.

### `editor-service`
- `edit_sessions`: active editing sessions or draft states.
- `draft_changes`: pending article or block edits.
- `publish_actions`: publish or submit-for-review events.
- `draft_snapshots`: point-in-time recoverable draft state for long editing sessions.
 - Emit content-changed events when article text or structure is published so search and audit can update.
- `edit_revisions`: immutable revision history for every saved change.
- `edit_diffs`: computed change sets that show what changed between saved versions.

### `audit-service`
- `audit_events`: immutable records of edits, imports, approvals, and operational actions.
- `entity_versions`: optional entity snapshot references for traceability.
- `audit_actors`: normalized actor information if the same actor metadata is reused frequently.
 - Publish amendment-created and version-transitions events so downstream services can build timelines and indexes.

### `search-service`
- `search_documents`: indexed constitution, article, and amendment documents.
- `search_terms` or `search_vectors`: derived full-text search structures.
- `index_sync_state`: watermark or cursor for incremental indexing.
- `search_facets`: derived filters such as country, version, article type, and language.

 - Return tokens or sessions synchronously so the frontend can establish identity without waiting for any background process.
### `ingestion-service`
- `import_jobs`: import runs and their status.
- `import_sources`: source file or URL metadata.
- `import_errors`: validation and parsing failures.
- `import_staging_records`: temporary parsed structures before they are committed to core services.
- `import_mappings`: source-to-canonical mapping when the import process normalizes numbering or structure.

## Detailed Implementation Roadmap

### Phase 1: Platform Foundation
 - Use synchronous commands for save, preview, and publish, but emit events for audit and downstream indexing.
- Create the monorepo or workspace structure with one folder per service.
- Add shared libraries only for stable concerns such as auth helpers, API clients, and schema validation.
- Scaffold each core service with Spring Boot, a health endpoint, and a basic database migration.
- Define OpenAPI contracts for the first internal and external APIs before implementing business logic.
- Set up `docker-compose` with Postgres instances or databases for each stateful service.
- Add a base CI pipeline that runs tests, linting, and service image builds.
- Establish logging, tracing, and structured error handling conventions across all services.
 - Consume domain events from all write-capable services and store them as the canonical history of system activity.
- Add repository-level conventions for package naming, module boundaries, and dependency injection style.
- Define the first set of domain events and command names so each service speaks in business terms.
- Introduce a seed dataset and a canonical test constitution for development and demos.
- Decide how the editor service will represent drafts, preview, and publish state before coding it.
- Document what can and cannot be shared in common libraries so the platform does not drift into another monolith.

### Phase 2: Content and Metadata Core
 - Rebuild or incrementally update the index from content and amendment events, never from direct database reads.
- Implement `catalog-service` with CRUD for countries, constitutions, and constitution versions.
- Implement `content-service` with article storage, ordering, stable article identifiers, and versioned snapshots.
- Implement `amendment-service` with amendment records and version transition links.
- Add read-only public APIs for listing countries, versions, and articles.
- Add source provenance fields to every importable or published record.
- Add database constraints for unique version labels, article ordering, and cross-service ownership.
- Create an internal seeding workflow so the platform can be bootstrapped with one or two sample constitutions.
 - Run long imports asynchronously and emit completion, failure, and staging events for the rest of the platform.
- Decide the canonical URL scheme for countries, versions, and articles before building the frontend.
- Add article cross-reference support if the imported sources contain explicit legal references.
- Ensure version publishing is immutable so history does not need to be rewritten later.
- Add search-index feed events only after the content versioning behavior is stable.

### Phase 3: Editorial Workflow and WYSIWYG Editing
- Implement `identity-service` with login, role assignment, and editor authorization.
- Implement `editor-service` with draft creation, content editing, save, discard, submit, publish, and revision history flows.
- Decide on a structured rich-text model for the editor, then map it to persisted content blocks.
- Add preview mode so editors can see the public rendering before publishing.
- Add audit logging for every edit, publish, and rollback action.
- Add basic moderation or review states if direct publish is too risky for the first release.
- Expose a minimal set of editor APIs so the frontend does not talk directly to databases.
- Preserve every save as a recoverable version so a previous state can be reopened, inspected, or restored.
- Add diff viewing so editors can see what changed between two saved versions.
- Keep the editing model intentionally single-user per draft to avoid the complexity of live collaboration.
- Build the editor around a clear command flow: load draft, edit block, save draft, preview, publish.
- Decide whether drafts are user-owned, document-owned, or both, because that affects collaboration later.
- Add content validation before publish so broken article numbering cannot be released.
- Keep editor rendering logic close to the public renderer so preview and public output stay consistent.
- Make rollback a first-class action rather than a manual database operation.

### Phase 4: Search and Import Pipelines
- Implement `ingestion-service` to accept structured source files, validate them, and create versioned imports.
- Add parsing and normalization rules for official source documents.
- Implement `search-service` as a derived index fed from published content and amendments.
- Add full-text search, country filters, version filters, and exact article lookup.
- Add incremental indexing so only changed content is reindexed.
- Add import error reporting and an operator-friendly retry path.
- Introduce a dead-letter or quarantine workflow for malformed source documents.
- Define whether imports are manual, scheduled, or triggered by a source change.
- Add a dry-run import mode so problematic documents can be tested without writing authoritative data.
- Decide how to handle renumbered or split articles during normalization before the first large import.
- Keep search indexing deterministic so the same input always produces the same search output.
- Add source-level import provenance so every stored article can be traced to the exact ingest event.

### Phase 5: Assistant and Automation Access
- Implement `mcp-server` as a guarded tool gateway for approved platform actions.
- Expose only explicit, whitelisted tools for reading content, proposing edits, and triggering workflows.
- Require authenticated sessions and role checks for every write-capable tool.
- Log every tool invocation to the audit trail with request metadata and actor identity.
- Add tool-level rate limits and scope restrictions so automation stays controlled.
- Keep the MCP surface narrow until the underlying services are stable.
- Define a separate read-only tool set for browsing and a write set for editor-approved mutations.
- Decide which editor actions can be invoked through MCP and which must remain UI-only.
- Add request validation and schema checks so tool inputs cannot bypass normal domain constraints.
- Keep the first MCP version intentionally small, with a narrow whitelist and explicit audit visibility.

### Phase 6: Hardening and Scale
- Add contract tests between all core services.
- Add migration rollback or forward-fix procedures for database changes.
- Add feature flags around editor publishing, new parser logic, and other risky flows.
- Add observability dashboards for import failures, search latency, and publish errors.
- Add backups and restore drills for the core databases.
- Measure page performance and optimize only the hotspots that matter.
- Introduce citation, notification, and document processing services only after the core path is stable.
- Decide on retention and archival rules for old drafts, audit logs, and import jobs.
- Add security review for every write-capable surface, especially the editor and MCP server.
- Validate restore procedures on a fresh environment rather than assuming backups are enough.
- Expand only the services that remove real complexity, not just those that sound useful.

## Service Implementation Notes

### `gateway-web`
- Render country, constitution, version, and article pages.
- Support stable article anchors and deep links.
- Provide editor-only routes for draft review and publishing.
- Keep page data loading isolated behind service clients so the frontend remains thin.
- Use server-side rendering for public content pages where it improves SEO and initial load time.
- Keep the public site resilient to partial backend failures by failing gracefully on optional content.
- Reuse the same article rendering path for public and preview states where possible.

### `catalog-service`
- Own the canonical country and constitution metadata.
- Expose lookup endpoints for public browsing and editor workflows.
- Store publication status, version timing, and source references.
- Keep the API read-friendly because this service will be heavily used by the public site.
- Make version publication state explicit so unpublished work does not leak into public views.

### `content-service`
- Own article structure and versioned article text.
- Support article ordering, retrieval, and content snapshots.
- Provide draft and published representations if needed.
- Treat article identity as stable within a constitution version and avoid reusing IDs for deleted text.
- Keep structure changes separate from textual changes when that simplifies comparison.

### `amendment-service`
- Record legal changes, amendment descriptions, and version transitions.
- Keep the original amendment source visible alongside derived changes.
- Support change summaries that can be rendered in the UI.
- Keep enough metadata to explain why a change happened, not just what changed.
- Distinguish official amendment acts from the derived platform representation of those acts.

### `identity-service`
- Handle editor authentication, roles, and session state.
- Keep permissions simple at first: viewer, editor, editor-review-publish, admin.
- Make authorization explicit in every service that writes data.
- Prefer a minimal permission model until there is a concrete reason to introduce finer-grained scopes.
- Store only what is necessary for identity and access control, not unrelated profile data.

### Role meaning
- `viewer`: can read public content.
- `editor`: can create and edit drafts.
- `editor-review-publish`: can review a draft, approve it, and publish it as a live version.
- `admin`: can manage users, permissions, and exceptional operational tasks.

### Difference between review and publish
- Review is the quality gate where content is checked for correctness, completeness, and policy compliance.
- Publish is the act of making an approved version visible on the public website.
- In this project, the same role performs both actions, but the system should still record them as separate events for audit history.

### `editor-service`
- Manage drafts, rich-text editing, and publish operations.
- Convert editor actions into domain-level commands rather than direct database writes.
- Preserve draft history so work can be resumed without data loss.
- Keep save operations idempotent so repeated clicks or retries do not corrupt drafts.
- Add content diffing so editors can see exactly what changed before publish.
- Make publish a separate command from save so accidental releases are less likely.
- Keep version history queryable so old revisions can be reopened and compared later.
- Treat every saved draft as part of an immutable revision chain instead of overwriting the previous state.

### `audit-service`
- Record an immutable sequence of system and human actions.
- Store actor, target entity, action type, timestamp, and trace metadata.
- Keep audit reads simple and optimized for lookup by entity or actor.
- Never mutate audit history; append-only is the rule.
- Store enough context to answer who changed what, when, from where, and through which surface.

### `search-service`
- Maintain a denormalized read model from published domain data.
- Index articles, versions, amendments, and source metadata.
- Prefer deterministic reindexing over complex partial updates until the platform is stable.
- Include faceting from the beginning if the user experience depends on country and version filtering.
- Keep ranking simple at first: relevance, version recency, and exact article matches should be easy to reason about.

### `ingestion-service`
- Validate source files before any data is written to core tables.
- Normalize incoming structures into the canonical content model.
- Keep import jobs idempotent so retries do not duplicate content.
- Record each parsing decision so future import fixes are explainable.
- Make import failures recoverable without manual database surgery.

### `mcp-server`
- Expose read and write tools for approved editor and automation workflows.
- Keep tool names stable and small in number.
- Route all mutations back through the owning services so no one bypasses the domain rules.
- Use separate tools for read, draft, preview, publish, and admin-style maintenance tasks.
- Treat every tool as a public contract that needs versioning and review.

## Local Testing Phases

### Fast feedback
- Unit tests for domain logic, validators, mapping code, and pure utility functions.
- Frontend component tests for rendering, form behavior, and editor state transitions.
- Service-layer tests that do not require external network calls.

### Service verification
- Spring Boot integration tests with database migrations applied.
- Repository tests against real PostgreSQL instances.
- API tests for request validation, authorization, and response contracts.

### Cross-service verification
- Contract tests for REST endpoints and event payloads.
- Compose-based integration runs for the core service chain.
- Minimal end-to-end tests for browse, login, edit, preview, publish, and search.

### Maintenance checks
- Migration dry runs.
- Seed data validation.
- Backup and restore smoke tests on non-production environments.

## Dependency Management and Maintenance
- Keep dependency versions pinned and reviewed through a single tracked inventory.
- Use one dependency manifest per service and one platform-level inventory for shared infrastructure.
- Track direct runtime dependencies, build dependencies, container image bases, and CI tooling separately.
- Prefer automated scans for discovery, but keep manual maintenance steps short and repeatable.
- Record the owner, current version, target version, and last review date for each dependency.
- Maintain an update checklist so a dependency change can be executed quickly without searching the codebase.
- Use Renovate Bot to open automated pull requests for dependency updates.
- Treat Renovate as the default updater, with humans reviewing, testing, and merging changes.

## Engineering Best Practices
- Keep service boundaries small and cohesive so each team can reason about one responsibility at a time.
- Prefer explicit DTOs and API contracts over sharing internal entities across services.
- Use ADRs for architecture decisions so future changes have a documented rationale.
- Require code review and a green CI pipeline before merging any change.
- Keep database migrations forward-compatible and reversible whenever possible.
- Add tests at the lowest useful level first, then add integration and end-to-end coverage for critical flows.
- Use feature flags for incomplete or risky behavior instead of long-lived branches.
- Make logging, metrics, and tracing part of the default implementation, not an afterthought.
- Favor simple implementations over clever abstractions unless there is a proven need.
- Reserve explicit refactoring capacity so technical debt is reduced continuously instead of accumulated.
- Use OpenAPI or equivalent schema definitions for REST APIs and version event schemas for async messages.
- Keep formatting, linting, and static analysis automated so style and safety do not rely on memory.

## Domain Model Assumptions
- A country can have one or more constitutional document families.
- Each constitution has many versions.
- Each version contains many articles (top-level provisions). Substructure is a **per-constitution tree**, not a global Artikel/Absatz/Satz schema.
- Amendments describe changes between versions and can target a whole article or any node in that constitution’s tree.

## Scrum Board Structure

### Backlog Columns
- `Ideas`: Not yet refined; do not pull into a sprint.
- `Ready`: One owner, testable acceptance, small enough for a sprint.
- `In Progress`: Actively being implemented.
- `Review`: Implementation complete, awaiting validation.
- `Done`: Accepted in the current repo (scaffold or feature).

### Priority Scale
- `P0`: Must-have for the first public browse + seed constitution.
- `P1`: Needed for editor, search, or amendments after browse works.
- `P2`: Important but not blocking those paths.
- `P3`: Nice to have.

### Refinement rules
- One **owner** (service or `gateway-web` / `infra`). No task spans two databases.
- **Size** S/M/L: S ≤ half day, M ≤ two days, L is a full sprint item (split if two L items share a sprint).
- Umbrella IDs (`DB-1`, `SRV-3`) stay for traceability; executable work is the child tasks (`CAT-*`, `CNT-*`, …).
- Do not pull `Ideas` or L items from later epics into Sprint 1.

### Board snapshot (repo as of Sprint 0 close)
- **Done:** SRV-1, SRV-2, OPS-1, OPS-2, OPS-3, OPS-5, OPS-6, OPS-7, CI-1, CI-2, CAT-1, CAT-2, CNT-1, CNT-2, OPS-4, GW-1, UI-1, UI-2, UI-3, QLT-4.
- **Not done (were listed under Sprint 0):** ARCH-1–3 physical schema, DB-1–3, DB-6, ING-1, UI-1, SRV-3 domain contracts, SRV-6, QLT-1.

## Epic 1: Information Architecture and Domain Modeling

| ID | Type | Priority | Status | Size | Owner | Story | Acceptance Criteria | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ARCH-1 | Story | P0 | Done | L | catalog + content + amendment | Canonical model for countries, constitutions, versions, articles, amendments. | Logical model in this file; physical tables land in CAT-1, CNT-1, AMD-1. One country with two versions can be stored. | None |
| ARCH-2 | Story | P0 | Done | M | content-service | Version is a full snapshot of articles in force. | `GET` articles by version returns the complete ordered set; later versions do not mutate older rows. | ARCH-1, CNT-1 |
| ARCH-3 | Story | P0 | Done | M | content-service | Each article is independently addressable. | Stable `article_id` (or equivalent) unique within a version; fetch by id. | ARCH-1, CNT-1 |
| ARCH-4 | Story | P0 | Done | M | amendment-service | Amendments link version changes and affected articles. | Amendment row references opaque source/target version ids and a list of affected article ids. | ARCH-2, ARCH-3, AMD-1 |
| ARCH-5 | Story | P1 | Done | L | catalog + content | Per-constitution content tree (not a fixed Artikel/Absatz/Satz model). | Catalog stores an outline for each constitution: ordered node kinds, allowed parent/child kinds, and whether a kind may hold text, children, or both. Depth and labels are data (e.g. DE `article → paragraph → sentence`; US `article → section`; a short charter may be articles only). Content stores an adjacency-list (or equivalent) tree per version: each node has `kind` from that outline, optional `label`/`number`, optional `body`, `parent_id`, `sort_order`. Existing article list/get stay valid: today’s `articles` rows are the configured top provision nodes (or a read model over them). A constitution with no sub-kinds still works as a flat list. | ARCH-3 |

## Epic 1B: Service Architecture and Contracts

| ID | Type | Priority | Status | Size | Owner | Story | Acceptance Criteria | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SRV-1 | Story | P0 | Done | M | docs | Clear service boundaries. | Ownership is documented (`AGENTS.md`, this backlog) and DBs are not shared. | ARCH-1 |
| SRV-2 | Story | P0 | Done | M | infra | Each stateful service owns its database. | Compose: one `*-db` + named volume per service. | SRV-1 |
| SRV-3 | Story | P0 | Ready | L | per API task | Versioned OpenAPI for real routes (not only `/internal/ping`). | Catalog and content public read APIs published via springdoc; gateway uses those contracts. | SRV-1, CAT-2, CNT-2 |
| SRV-4 | Story | P1 | Ideas | M | amendment + content | Events: version published, amendment created, article updated. | Event names and JSON schemas documented; no broker required yet. | SRV-3, ARCH-4 |
| SRV-5 | Story | P1 | Ideas | L | n/a | Extra services (translation, citation, document-processing). | Out of scope until browse + editor exist. Core eight services already scaffolded. | SRV-1 |
| SRV-6 | Story | P0 | Done | L | editor-service + gateway-web | Authenticated WYSIWYG edit/publish. | Split in Sprint 3: IDN-1, ED-1–3, UI-ED-1. Not Sprint 1. | SRV-2, IDN-1, CNT-2 |
| SRV-7 | Story | P1 | Ideas | L | mcp-server | Whitelisted MCP tools. | After editor + audit exist; read-only first. | SRV-6, GOV-1 |

## Epic 2: Database and Persistence Layer

`DB-1`–`DB-3` and `DB-6` are umbrellas. Implement the per-service tasks.

| ID | Type | Priority | Status | Size | Owner | Task | Acceptance Criteria | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DB-1 | Task | P0 | Done | L | split | Umbrella: countries … amendment_changes. | Done when CAT-1, CNT-1, and AMD-1 are Done. | ARCH-1 |
| DB-2 | Task | P0 | Ready | S | CAT-1 / CNT-1 | Uniqueness (country code, slug, version label, article number in version). | Enforced in those Flyway files, not a separate migration elsewhere. | CAT-1, CNT-1 |
| DB-3 | Task | P0 | Ready | S | catalog-service | Provenance columns on versions/sources. | Included in CAT-1 (`source_url`, gazette ref, `language_code`, timestamps). | CAT-1 |
| DB-4 | Task | P1 | Done | M | search-service | Full-text index tables / tsvector. | Keyword search over published articles; derived data only. | SRC-1, SRCH-1 |
| DB-5 | Task | P1 | Ideas | M | amendment-service | Change ops: added / modified / deleted / renumbered. | Folded into AMD-3 (`added` / `changed` / `removed`). Keep this ID only as a pointer. | AMD-1, AMD-3 |
| DB-6 | Task | P0 | Done | S | docs | Schema pattern (normalized + JSONB metadata + outbox later). | Short note in `docs/adr` or QLT-1; no shared DB. | SRV-2 |
| CAT-1 | Task | P0 | Done | M | catalog-service | Flyway `V2__catalog_domain.sql`: `countries`, `constitutions`, `constitution_versions`, `constitution_sources`. | Unique ISO/slug/version_label; provenance fields; Testcontainers insert+query. | ARCH-1 |
| CNT-1 | Task | P0 | Done | M | content-service | Flyway `V2__content_domain.sql`: `articles` (+ optional `article_blocks`). | Unique (version_id, article_number); ordered list; snapshot rows immutable. | ARCH-2, ARCH-3 |
| AMD-1 | Task | P1 | Done | M | amendment-service | Flyway `V2__amendment_domain.sql`: `amendments`, `amendment_changes`, `version_transitions`. | Opaque catalog/content ids only; no FK across DBs. | ARCH-4 |
| AMD-3 | Story | P1 | Done | M | amendment-service | Richer amendment-change records: typed ops, dates, amending-law citation, tree target. | New Flyway (do not edit AMD-1). `change_type` is a constrained enum with at least `added`, `changed`, `removed` (optional extras like `renumbered` ok). Each change has `changed_on` (enactment of the amending law) and `effective_on` (when the change took effect; null if same as `changed_on`). Each change stores an opaque `amending_law_citation_id` for a citation-service object (no SQL FK; citation-service may still be SRV-5). Each change targets an opaque content **node** id (whole article or any descendant in that constitution’s tree); whole-article change remains valid when the act replaces or repeals the article. AMD-2 read API returns these fields. Depends on ARCH-5 for sub-article targets. Supersedes the thin `DB-5` enum-only slice. | AMD-1, AMD-2, ARCH-5, SRV-5 |
| IDN-1 | Task | P1 | Done | M | identity-service | Flyway `V2__identity.sql`: `users`, `roles`, `user_roles`. | Can store local-editor from env; password hash column. | SRV-2 |
| ED-1 | Task | P1 | Done | M | editor-service | Drafts: `edit_sessions`, `draft_changes`, `edit_revisions`. | After IDN-1 and CNT-1. | IDN-1, CNT-1 |
| AUD-1 | Task | P1 | Done | M | audit-service | `audit_events` append-only. | Insert + list by entity; updates/deletes rejected. | GOV-1 |
| SRCH-1 | Task | P1 | Done | M | search-service | `search_documents`, `index_sync_state`. | Rebuild from content API/events, never catalog SQL. | CNT-2, SRC-1 |
| ING-DB | Task | P1 | Done | M | ingestion-service | `import_jobs`, `import_errors`, `import_staging_records`. | Job row + error log; no write to catalog except via catalog API. | ING-1, CAT-2 |

## Epic 2B: Local Development and Orchestration

| ID | Type | Priority | Status | Size | Owner | Task | Acceptance Criteria | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OPS-1 | Task | P0 | Done | M | infra | Compose stack. | `./manageLocalStack.sh --start` brings up services + DBs. | SRV-1 |
| OPS-2 | Task | P0 | Done | M | infra | Dockerfile per runnable service. | Images exist; start is slow (see OPS-8). | SRV-1 |
| OPS-3 | Task | P0 | Done | S | infra | Env profiles and JDBC wiring in Compose. | `env/*.env.example`; each app points at its `*-db`. | OPS-1 |
| OPS-4 | Task | P0 | Done | M | catalog + content | Seed one demo country (two versions, ~10 articles) without full ingestion. | Fresh volume + migrate + seed SQL or `application` runner; UI-1 can render it. Do not wait for ING-1. | CAT-1, CNT-1 |
| OPS-5 | Task | P0 | Done | S | infra | Compose `healthcheck` + `depends_on: condition: service_healthy` for DBs and apps. | Unhealthy container is visible; apps wait for Postgres. | OPS-1 |
| OPS-6 | Task | P0 | Done | S | infra | Build `edge-proxy` in `BUILD_ORDER` (or `compose build` before `up --no-build`). | `--start` does not fail with missing `verfassung-edge-proxy`. | OPS-2 |
| OPS-7 | Task | P0 | Done | S | infra | Named Postgres volumes; `--reset` uses `down -v`. | `--stop` keeps data; `--reset` wipes `*-db-data`. | OPS-1 |
| OPS-8 | Task | P1 | Done | M | each Kotlin Dockerfile | Cache Gradle deps: copy `build.gradle.kts` first, then sources; optional BuildKit cache mount. | Rebuild after a Kotlin-only change does not re-download Maven. | OPS-2 |

## Epic 3: Content Ingestion and Editorial Workflow

| ID | Type | Priority | Status | Size | Owner | Story | Acceptance Criteria | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ING-1 | Story | P0 | Done | L | ingestion-service | Import a version from structured input (JSON/YAML). | Calls catalog + content APIs in one job; rollback/fail leaves no partial public version. Sprint 2, not required for OPS-4 seed. | CAT-2, CNT-2, ING-DB |
| ING-2 | Story | P0 | Done | M | ingestion-service | Validate article order and numbering. | Invalid numbering → job `failed` + `import_errors`; no catalog write. | ING-1, CNT-1 |
| ING-3 | Story | P1 | Ideas | M | ingestion-service | Attach sources/citations on import. | Forwards provenance to catalog `constitution_sources`. | ING-1, CAT-1 |
| ING-4 | Story | P1 | Ideas | L | amendment-service | Amendments as change sets → new version. | New content snapshot + amendment rows. | DB-5, AMD-1, CNT-2 |
| ING-5 | Story | P2 | Ideas | L | later | Translation import. | Out of Sprint 1–2. | ARCH-5 |

## Epic 4: Public Browsing Experience

| ID | Type | Priority | Status | Size | Owner | Story | Acceptance Criteria | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UI-1 | Story | P0 | Done | M | gateway-web | Browse by country. | `/` lists countries; `/countries/[code]` lists constitutions/versions. Data from catalog API. | CAT-2, OPS-4 |
| UI-2 | Story | P0 | Done | M | gateway-web | Read a version’s articles in order. | `/countries/[code]/versions/[id]` lists articles; article page shows body. | CNT-2, UI-1 |
| UI-3 | Story | P0 | Done | S | gateway-web | Article permalink + heading anchor. | Stable URL; in-page `#` for article number. | UI-2, ARCH-3 |
| UI-4 | Story | P1 | Ideas | L | gateway-web | Side-by-side version compare. | After AMD-1 + DB-5. | ARCH-4, DB-5 |
| UI-5 | Story | P1 | Done | M | gateway-web | Amendment timeline. | After AMD-2. | ARCH-4, AMD-2 |

## Epic 4B: First domain APIs (executable)

Replace `/internal/ping` only on the services in this table. Leave search/audit on ping until their sprint.

| ID | Type | Priority | Status | Size | Owner | Task | Acceptance Criteria | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CAT-2 | Task | P0 | Done | M | catalog-service | Read API: list countries, get country, list versions for a constitution. | OpenAPI; 404 on unknown; Testcontainers API test; unpublished versions omitted. | CAT-1 |
| CNT-2 | Task | P0 | Done | M | content-service | Read API: list articles for `versionId`, get article by id. | Ordered list; 404; API test. `versionId` is an opaque catalog id (no catalog SQL). | CNT-1 |
| GW-1 | Task | P0 | Done | M | gateway-web | HTTP clients for CAT-2 and CNT-2 (env base URLs via Caddy or Compose DNS). | Server components fetch; empty/error states if API down. | CAT-2, CNT-2 |
| AMD-2 | Task | P1 | Done | M | amendment-service | Read API: list amendments for a version transition. | After AMD-1; not Sprint 1. | AMD-1 |
| UI-ED-1 | Task | P1 | Done | M | gateway-web | Editor login page and a signed-in `/editor` shell. | Form posts to identity-service; httpOnly session cookie; unauthenticated `/editor` redirects to `/login`. WYSIWYG is still SRV-6. | IDN-2 |
| IDN-2 | Task | P1 | Done | M | identity-service | Login (session or JWT) for editor role. | After IDN-1. | IDN-1 |
| ED-2 | Task | P1 | Done | L | editor-service | Draft save/preview commands. | After ED-1, IDN-2, CNT-2. | ED-1, IDN-2 |

## Epic 5: Search, Navigation, and Discovery

| ID | Type | Priority | Status | Size | Owner | Story | Acceptance Criteria | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SRC-1 | Story | P0 | Done | L | search-service + gateway-web | Keyword search across articles. | Sprint 2+; needs SRCH-1 and published content. Do not block UI-1. | SRCH-1, CNT-2 |
| SRC-2 | Story | P1 | Ideas | M | search-service | Facet filters (country, version, date). | After SRC-1. | SRC-1 |
| SRC-3 | Story | P1 | Ideas | M | gateway-web | In-text cross-reference links. | Needs `article_links` or similar. | UI-2, ARCH-3 |
| SRC-4 | Story | P2 | Ideas | L | search-service | Global term index. | Later. | DB-4 |

## Epic 6: Trust, Quality, and Governance

| ID | Type | Priority | Status | Size | Owner | Task | Acceptance Criteria | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GOV-1 | Task | P1 | Done | M | audit-service | Record actor + action + entity + time. | AUD-1 schema + append API used by editor/ingestion (Sprint 3). | AUD-1 |
| GOV-2 | Task | P0 | Done | M | ingestion-service | Validate before persist. | Same sprint as ING-1; not Sprint 1 seed. | ING-1 |
| GOV-3 | Task | P1 | Done | L | editor-service | Review then publish as separate events. | Same role may do both; two audit event types. | GOV-1, ED-2 |
| GOV-4 | Task | P1 | Done | M | infra | Restore drill from `infra/backup`. | Script dumps all eight DBs (include `search`); documented restore. Current script is incomplete. | OPS-7 |
| GOV-5 | Task | P2 | Ideas | S | catalog-service | Verification flags on sources. | Later. | CAT-1 |

## Epic 7: Platform and Performance

| ID | Type | Priority | Status | Size | Owner | Task | Acceptance Criteria | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PLAT-1 | Task | P0 | Ready | S | gateway-web | SSR country/version/article pages; no N+1 in the page. | After UI-2; measure locally, no CDN required. | UI-1, UI-2 |
| PLAT-2 | Task | P1 | Done | M | content + gateway-web | Paginate long article lists. | After a large seed exists; not Sprint 1 (~10 articles). | UI-2 |
| PLAT-3 | Task | P1 | Ideas | M | gateway-web | Language switcher. | After ING-5. | ING-5 |
| PLAT-4 | Task | P1 | Ideas | M | all services | JSON logs + correlation id. | After browse works. | UI-1 |

## Epic 8: CI and Delivery Automation

| ID | Type | Priority | Status | Size | Owner | Task | Acceptance Criteria | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CI-1 | Task | P0 | Done | S | .github | Pipeline on push/PR. | Workflow exists. | None |
| CI-2 | Task | P0 | Done | M | .github | `gradle test` per microservice + frontend lint/build. | Matrix/discover all `services/*/build.gradle.kts`. Domain API tests still missing (add with CAT-2/CNT-2). | CI-1 |
| CI-3 | Task | P1 | Done | M | .github | `docker build` (or compose) per service image. | Separate job; do not block merge on 8× full `bootJar` until OPS-8. | OPS-2, OPS-8 |
| CI-4 | Task | P1 | Done | M | .github | ktlint/detekt + `tsc` already via next lint. | Fail on errors. | CI-1 |
| CI-5 | Task | P1 | Ready | S | .github | Gradle wrapper or setup-gradle cache (already partially true). | Add wrappers so local and CI match. | CI-2 |

## Epic 9: Dependency Tracking and Manual Maintenance

Keep this epic **out of Sprint 1**. One hygiene sprint later is enough.

| ID | Type | Priority | Status | Size | Owner | Task | Acceptance Criteria | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEP-1 | Task | P1 | Done | M | docs | Inventory of runtime/build/image deps. | One markdown table or Renovate dashboard. | OPS-2 |
| DEP-2 | Task | P2 | Ideas | S | docs | Owner + review cadence per dependency. | After DEP-1. | DEP-1 |
| DEP-3 | Task | P2 | Ideas | S | docs | Upgrade checklist (test one service, then CI). | After DEP-1. | DEP-1, CI-2 |
| DEP-4 | Task | P1 | Ideas | S | GitHub | Dependabot or Renovate alerts. | After DEP-7 or instead of it. | DEP-1 |
| DEP-5 | Task | P2 | Ideas | S | docs | Base images in the same inventory. | After DEP-1. | DEP-1 |
| DEP-6 | Task | P2 | Ideas | S | docs | Emergency patch runbook. | After DEP-3. | DEP-3 |
| DEP-7 | Task | P1 | Done | S | GitHub | Renovate (or Dependabot) on Gradle + npm. | Opens PRs; humans merge. | CI-1 |

## Epic 10: Code Quality and Technical Debt Prevention

| ID | Type | Priority | Status | Size | Owner | Task | Acceptance Criteria | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QLT-1 | Task | P1 | Done | S | docs | ADR: DB-per-service, Caddy entry, no shared DB. | `docs/adr/0001-….md`. Not a Sprint 1 blocker. | SRV-1 |
| QLT-2 | Task | P1 | Ideas | M | GitHub | Branch protection requiring CI. | After CI-2 is green on main. | CI-2 |
| QLT-3 | Task | P1 | Ideas | M | catalog + content | Consumer tests for CAT-2/CNT-2. | After those APIs exist. | CAT-2, CNT-2 |
| QLT-4 | Task | P0 | Done | S | docs | Flyway forward-only; new `V{n}` per change; no edit of applied files. | Document in AGENTS or ADR. | CAT-1 |
| QLT-5 | Task | P1 | Ideas | M | editor | Feature flag for publish. | Sprint 3. | ED-2 |
| QLT-6 | Task | P1 | Ideas | S | all | Actuator health already on; add `info` + log correlation. | With PLAT-4. | PLAT-4 |
| QLT-7 | Task | P2 | Ideas | S | process | 10% sprint capacity for cleanup. | Planning habit, not a ticket to “finish”. | None |
| QLT-8 | Task | P1 | Ideas | M | repo | Spotless/ktlint + existing Next lint. | With CI-4. | CI-4 |

## Suggested Sprint Breakdown

Pull **only Ready P0 tasks** listed under each sprint. Do not re-open Done IDs.

### Sprint 0: Foundation — closed
Done: SRV-1, SRV-2, OPS-1, OPS-2, OPS-3, OPS-7, CI-1, CI-2.
Deferred out of Sprint 0 (were overscoped): ARCH physical schema, DB-*, ING-1, UI-1, SRV-6, QLT-1.

### Sprint 1: Public browse + seed — closed
Done: OPS-6, CAT-1, CAT-2, CNT-1, CNT-2, OPS-4, GW-1, UI-1, UI-2, UI-3, OPS-5, QLT-4.

Out of Sprint 1: search, editor, identity, ingestion job, amendments, Renovate, image-build CI, MCP.

### Sprint 2: History + import — closed
Done: AMD-1, AMD-2, ARCH-4, DB-1, ING-DB, ING-1, ING-2, GOV-2, UI-5, OPS-8.
Catalog/content gained write APIs so ingestion can publish a version via HTTP only (draft → articles → publish).

Deferred (capacity): CI-5 (Gradle wrappers). UI-4 (compare) stays later with DB-5. Search moved to Sprint 5.

### Sprint 3: Editor — closed
Done: IDN-1, IDN-2, ED-1, ED-2, UI-ED-1, SRV-6, AUD-1, GOV-1, GOV-3.
Editor login, in-page article edit, save/review/publish commands (publish is an audit + session status; public content rewrite is QLT-5).

### Sprint 4: Hygiene — closed
Done: DEP-1, DEP-7, CI-3, CI-4, QLT-1, DB-6, GOV-4, PLAT-2.
TypeScript is enforced via `next build`. Deferred: QLT-3 (Pact-style consumer tests), QLT-8 (ktlint/Spotless on all Kotlin services), PLAT-4 (JSON logs everywhere).

### Sprint 5: Search — closed
Done: SRC-1, SRCH-1, DB-4.
Keyword search over a derived Postgres tsvector index rebuilt from catalog + content HTTP (never catalog SQL). Gateway `/search` fails open if the index is down. Facets stay SRC-2.

### Sprint 6: Content tree + amendment records — closed
Done: ARCH-5, AMD-3.
Catalog stores a per-constitution outline; new constitutions default to a flat `article` kind. Content keeps `articles` as the top-provision read model and adds an adjacency-list `content_nodes` tree (DE seed: Article 1 as article → paragraph → sentence). Amendment changes use `added`/`changed`/`removed`, `changed_on` + `effective_on`, opaque citation ids, and a content `node_id`.

Out of Sprint 6: QLT-5 (editor public rewrite), UI-4 (compare), SRC-2 (search facets), CI-5, citation-service (SRV-5). DB-5 remains a pointer at AMD-3.

### Later / Ideas
SRV-5, SRV-7, ING-5, SRC-2–4, PLAT-3, PLAT-4, QLT-3, QLT-5, QLT-8, DEP-2–6.

## Open Product Questions
- Should published constitutional versions be immutable snapshots only, or do you want official errata and corrections modeled separately?
- Do you want the WYSIWYG editor to store content as a structured document tree, a delta format, or a server-normalized block model?
- Should the MCP server be read-only at first, or should it already support a limited set of write actions for trusted editors?
- Which countries should be treated as the seed corpus for the first import cycle?
- Do you want translation support to be modeled as a later service, or should the schema reserve language-aware structures from day one?
- Should review and publish be separate roles from editor, or combined initially for simplicity?
- Do you prefer strict article numbering preserved exactly as source text, even when it contains irregularities, or should normalization clean up obvious inconsistencies?

## Definition of Ready
- The story has a clear user or system goal.
- Acceptance criteria are testable.
- Required data entities are identified.
- Dependencies are understood.
- The work is small enough to fit into a sprint.
- The owning service and integration points are known.
- Data contract changes have been reviewed for backwards compatibility.
- UX or editorial assumptions are written down if the story touches the user interface.
- Test approach is known, even if the tests are not yet written.

## Definition of Done
- The feature is implemented and reviewed.
- Relevant tests or validation pass.
- Data model changes are migrated safely.
- Public-facing behavior matches acceptance criteria.
- Documentation is updated if the workflow or schema changed.
- The change is deployed or ready to deploy without manual schema edits.
- Observability exists for any new critical path.
- Rollback or forward-fix path is known for risky changes.
- Any new service contract is versioned and documented.

