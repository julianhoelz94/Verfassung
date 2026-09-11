<!-- Generated: 2026-09-06 | Files scanned: ~250 | Token estimate: ~850 -->
# Data

One Postgres per service (`docker-compose.yml` `*-db`). **No cross-service FKs.** Same UUID may appear in two DBs as a copied id.

Flyway: `services/<name>/src/main/resources/db/migration/`. Forward-only `V{n}__….sql`. Every service has `V1__init.sql` (`service_bootstrap_marker`).

## catalog_db

| Table | Role |
| --- | --- |
| `countries` | iso_code PK-unique |
| `constitutions` | per country, slug unique |
| `constitution_versions` | label, dates, `publication_status`, chain (V9: `predecessor_version_id`, `hop_kind`, `listing`). ADR 0005 / CAT-6: `legal_version_id`, legal vs editorial predecessors; `hop_kind` `initial`/`legal`/`editorial_correction` |
| `constitution_sources` | citations + verification |
| `constitution_node_kinds` | outline: kind_code, flags, presentation `section\|concatenated` (V6) |
| `constitution_node_kind_edges` | allowed parent→child kinds |

Latest: V10 two-axis chains. Seed: `V3__seed_germany.sql` (demo provenance, not official); V9 sets 1949 `initial` and 2022 `legal_amendment`; V10 migrates that hop to `legal` and fills `legal_version_id`.

## content_db

| Table | Role |
| --- | --- |
| `articles` | View over root `content_nodes` (`parent_id IS NULL`); V7 dropped the table |
| `content_nodes` | Tree (`parent_id`, kind, body, `predecessor_id` V7). Display and write SoT |

Seed: `V3__seed_germany_articles.sql`, `V5__seed_article1_tree.sql`.

## amendment_db

`version_transitions` (source→target UUIDs, `constitution_id`), `amendments` (`constitution_id`, `kind` until AMD-11, `status`, nullable `version_transition_id`, `published_revision_id`), `amendment_revisions` (linear chain), `amendment_changes` (hang off `revision_id`; V6 amending-law text). Seed: `V3__seed_basic_law_transition.sql`. Latest: V7. **ADR 0005 / AMD-11** (next Flyway, do not edit V7): drop `kind`; revision `comment` + `documents` JSONB; published pins; `review_status`.

## identity_db

`roles`, `users` (+ `enabled` V5), `user_roles`, `sessions` (+ `last_seen_at` V4), `login_throttle`, `invites`, `password_resets`, `user_mfa`, `mfa_recovery_codes`, `mfa_challenges`, `service_tokens` (V8, `expires_at` V9).

Roles seeded: `admin`, `editor`, `viewer`, then `reviewer`, `publisher` (V3).

## editor_db

`edit_sessions` (status enum `open→reviewing→approved→published`, CHECK V3), `draft_changes` (JSONB), `edit_revisions` (snapshot JSONB), `outbox_events` (V4: `event_name`, `payload` JSONB, `created_at`, `published_at`; scheduler publishes `search.reindex-requested`). Latest: V4.

## search_db

`search_documents` (GIN `tsv`; V5 `language_code`, german vs simple + article-number simple vector), `index_sync_state`. Rebuilt; not authoritative. Latest: V5.

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

JSONB is used for drafts, import staging, audit payloads, and the editor outbox. Other services may add their own outbox later (ADR 0001 / 0003).

Backup: `infra/backup/backup.sh` dumps all eight DBs into `./backups/<timestamp>/`.
