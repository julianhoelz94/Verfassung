# Sprint 40: mixed-content foundations

Tracked stories: VER-224, VER-209, VER-221, VER-219, VER-211, VER-210.

## Contracts and rollout

ADR 0006 defines immutable node/text revisions, logical identities, version occurrence aliases, and ordered snapshot roots. Content owns these tables; catalog owns immutable structural settings and constitution metadata history. Editor stores source pins and targeted operation deltas, replaying them for previews.

Catalog settings preflight checks stored version content against proposed capabilities and reports open draft sessions. Existing versions retain structural pins. Reader settings overlay current presentation by kind code. Occupied incompatible changes return `migration_required`; historical settings restore creates another checked revision. Slug changes require retained aliases, with reservation ownership checked after insertion.

Content exposes `GET/PUT /versions/{id}/content` and `GET /versions/{id}/resolve?logicalId=...`. Ordered writes require the expected target generation and an explicit source generation when referencing another version. Untouched immutable revisions are shared. Compatibility article/node responses preserve aliases and predecessor occurrences from the selected source snapshot. V8 backfills exact legacy bodies before children, marking inferred mixed order; runtime legacy refresh uses the same raw MD5 logical text identity as the migration.

Editor exposes `POST /edit-sessions/{id}/structured-saves` and `GET /edit-sessions/{id}/structured-draft`. Operations support text replacement, metadata changes, insertion/removal, explicit moves, and exact-text split/merge. Saves check source/settings pins and generation. Legacy flattening and legacy publishing reject structured/mixed drafts.

**Mixed ordered writes default to disabled** (`content.ordered-mixed-writes.enabled=false`). Sprint 41 owns end-to-end publication and public-consumer rollout. This sprint supplies the persistence and targeted-draft foundations; it does not enable that later rollout. Tests explicitly enable mixed writes to validate the new contract.

## Verification

Catalog, content, and editor Gradle test suites; gateway lint, production build, unit regressions; Chromium admin create/save and responsive mixed preview journeys. Independent reviewer and verifier inspect the combined sprint diff and recheck corrections. CI remains the final merge gate.

The ChatGPT visual reference linked in VER-210 could not be opened because automatic approval review required specific permission. The UI follows the issue's written design requirements; desktop/mobile screenshots verify its rendered layout.
