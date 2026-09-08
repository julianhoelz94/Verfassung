<!-- Generated: 2026-09-06 | Files scanned: ~250 | Token estimate: ~850 -->
# Data

One Postgres per service (`docker-compose.yml` `*-db`). **No cross-service FKs.** Same UUID may appear in two DBs as a copied id.

Flyway: `services/<name>/src/main/resources/db/migration/`. Forward-only `V{n}__….sql`. Every service has `V1__init.sql` (`service_bootstrap_marker`).

## catalog_db

| Table | Role |
| --- | --- |
| `countries` | iso_code PK-unique |
| `constitutions` | per country, slug unique |
| `constitution_versions` | label, dates, `publication_status`, provenance/verification (V5) |
| `constitution_sources` | citations + verification |
| `constitution_node_kinds` | outline: kind_code, flags, presentation `section\|concatenated` (V6) |
| `constitution_node_kind_edges` | allowed parent→child kinds |

Latest: V8 untitled paragraphs. Seed: `V3__seed_germany.sql` (demo provenance, not official).

## content_db

| Table | Role |
| --- | --- |
| `articles` | version_id + article_number; list/patch API |
| `content_nodes` | tree (`parent_id`, kind, body). Display SoT (V6: parent body null if children) |

Seed: `V3__seed_germany_articles.sql`, `V5__seed_article1_tree.sql`.

## amendment_db

`version_transitions` (source→target UUIDs), `amendments`, `amendment_changes` (V4 change records). Seed: `V3__seed_basic_law_transition.sql`.

## identity_db

`roles`, `users` (+ `enabled` V5), `user_roles`, `sessions` (+ `last_seen_at` V4), `login_throttle`, `invites`, `password_resets`, `user_mfa`, `mfa_recovery_codes`, `mfa_challenges`, `service_tokens` (V8).

Roles seeded: `admin`, `editor`, `viewer`, then `reviewer`, `publisher` (V3).

## editor_db

`edit_sessions` (status `open→reviewing→approved→published`), `draft_changes` (JSONB), `edit_revisions` (snapshot JSONB).

## search_db

`search_documents` (GIN `tsv`, facets V3: country, version, effective_date, titles), `index_sync_state`. Rebuilt; not authoritative.

## ingestion_db

`import_jobs` (payload JSONB), `import_errors`, `import_staging_records`.

## audit_db

`audit_events` (JSONB payload). `actor_id`/`actor_email` nullable (V3). UPDATE/DELETE rules no-op.

## Where to add schema

| Change | Service / next migration |
| --- | --- |
| Country / version / outline | catalog |
| Article text / tree | content |
| Amendment metadata | amendment |
| User / session / token | identity |
| Draft workflow | editor |
| Search document fields | search (and reindex) |
| Import job fields | ingestion |
| Audit event shape | audit (append-only — extra columns only if needed) |

JSONB is used for drafts, import staging, audit payloads. Outbox tables are allowed later per ADR; none required yet.

Backup: `infra/backup/backup.sh` dumps all eight DBs into `./backups/<timestamp>/`.
