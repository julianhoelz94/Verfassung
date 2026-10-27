<!-- Reviewed: 2026-10-19 -->
# Data ownership

Nine Postgres databases, one per stateful service. Other services copy opaque IDs
and use owner APIs; there are no cross-service foreign keys. Gateway and MCP are
stateless. Add a new Flyway migration under the owner rather than editing an applied
migration. The migration directory and repository SQL are authoritative for current
columns and indexes; historical seed/compatibility migrations must remain available.

| Database | Current table families and invariants |
| --- | --- |
| Catalog | Current/historical jurisdiction hierarchy, countries/constitutions/sources; two-axis `constitution_versions`; outline kinds/edges; settings and metadata revisions/slug aliases; constitution and provision lifecycle events; contextual wiki pages/revisions; successor reservations and import publication holds |
| Content | `content_snapshots`, immutable `content_node_revisions` / `content_text_revisions`, ordered `content_revision_entries`, snapshot roots/occurrences and publication receipts; legacy `content_nodes` and the `articles` compatibility view remain supported |
| Amendment | Legal change identity/revisions/changes, published version pins, diff runs/decisions and publication-attempt receipts; legacy transitions remain for compatibility |
| Document | Documents, immutable metadata/files/revisions and append-only lifecycle/link events; legal-page revisions/publication and shared imprint-contact revisions |
| Identity | Users/roles/sessions, throttles, invites/reset/registration verification, MFA/recovery/challenges, passkeys, service/MCP/OAuth credentials, saved mail/access/translation policies, durable `deployment_setup` and transactional `security_audit_outbox` |
| Editor | Sessions, draft changes/revisions, pinned structured sources/operations, publication jobs, diff runs/decisions and delivery outbox |
| Ingestion | Jobs/errors/staging records, batches/review decisions, setup proposals, resumable uploads/chunks and publication outbox |
| Search | Rebuildable `search_documents` and `index_sync_state`; generation-pinned reads use one consistent index transaction |
| Audit | Append-only `audit_events`; stable event IDs deduplicate retries; original attribution/time are retained; restricted runtime INSERT/SELECT role is separate from Flyway owner |

Catalog V25/V26 add `jurisdictions` with stable IDs, sibling-unique slugs, optional codes, historical status and optional existence dates. Existing countries retain their UUIDs as root jurisdictions. Constitutions, slug aliases and succession are scoped to `jurisdiction_id`; nullable `country_id` preserves legacy national-owner reads. Historical codes may be reused without merging identities.

A logical content ID identifies a unit across revisions; a revision ID identifies
immutable content; an occurrence ID pins its position in a version. Authored labels
are display text and cannot replace those identities. Reusing a revision during
publication is limited to the pinned source/target snapshots. Legal changes,
editorial corrections and constitution lifecycle are separate concepts.

Document citation links pin an immutable document revision and, for amendments or
wiki content, the owning revision scope. Legal prose and shared contact publication
remain in the same Document database transaction.

Fresh content fixtures are generated and uploaded through real APIs, then read back.
Do not restore historical seed writes or flatten mixed content to simplify a test.

`infra/backup/backup.sh` dumps all nine databases and removes its `INCOMPLETE` marker
only after every dump succeeds. `restore.sh` rejects marked backups and validates
all required nonempty readable dumps before its first schema replacement. Restoration is still a
sequence of per-database operations, not a distributed transaction. See the Wiki's
Local Stack Reference for the explicit restore command.
