# Review a legacy archive migration

A migration package keeps the supplied source inventory, captured files and target mappings together. Uploading does not publish anything. Use an account key with `mcp:read` and `ingestion:import` for staging, then use the normal editorial roles on the website.

## Supply and check a package

1. Inventory every source, including frame wrappers, alternate views, missing pages and deliberate exclusions. Record stable source keys, URLs, aliases, SHA-256 hashes, encoding, attribution and reasons. Use `captureKey` for the corresponding captured document and `targetKeys` for the extracted resources.
2. Find the real jurisdiction with `list_jurisdictions`. Use its UUID for a regional or historical constitution; country-code imports remain supported. Record parentage and existence dates only when supported by evidence.
3. Call `get_import_setup`. For a new constitution, submit `propose_constitution_setup` with a representative rich sample; an editor inspects and confirms the outline in the site. Full uploads use the confirmed constitution and settings revision IDs.
4. Create or resume `create_migration_run` with the same run key and inventory. Stage immutable source-keyed items with `stage_migration_item`. Supported items are snapshots, captured documents/citations, amendment metadata, document relationships, legacy mappings and authored comparisons. Larger items use existing batch/chunk upload tools with an envelope containing `migrationRunId` and `item`.
5. Open **Editorial → Imports → Migration packages**. Prepare resources as an editor; unresolved dependencies remain visible and can be retried. Compare escaped original evidence with the prepared reader result. Original HTML is downloadable as an attachment and is never executed as a source preview.
6. Consume every page of `export_import_job` for the prepared snapshot. Require `complete=true`, both completeness flags, no fidelity mismatches, no active validation errors and the declared structural/document counts. Submitted view is the request receipt; prepared view reads actual Content, Catalog and linked Document data.
7. Open the native review link. A reviewer approves after checking the source and links. A publisher with fresh MFA publishes the approved snapshot. Captured evidence becomes public only through authorized published relationships; amendments and comparisons have their own review/publication decisions.

Keep historical spelling, literal labels, table geometry, note targets and mixed text/child order. Type source, editorial and amendment notes separately from enacted text. Store uncertain date wording, precision, source coverage and old status wording as evidence; leave an unknown effective day empty. An archival source label does not claim present legal validity.

## Resume and reconcile

Use the same run/source identities and exact payload when retrying. A different payload under an existing key is a conflict; use a new identity after reviewing the correction. `get_migration_run` and paginated `get_migration_attempts` retain coverage and preparation history beyond temporary upload expiry. Resume missing chunks with `get_import_upload`; after expiry, consult the durable run before creating a new upload. Included, unavailable and excluded sources all count toward the inventory denominator.

Resource preparation can partially succeed across services. Successful native handles and revision pins remain visible; retry unresolved items after preparing dependencies. A conflicting document pin or changed reserved draft requires explicit reconciliation. No tool exposes arbitrary domain writes, approval or publication.

## Reader parity

Controlled legacy URLs resolve through Catalog mappings to exact published versions, units, notes or document revisions. Fragments are mapped in the browser because servers never receive them. Unmapped or ambiguous URLs fail visibly; a later publication does not change a historical target.

Constitution readers link to a searchable amendment register. Instrument and effective dates use separate filters; unknown dates remain unknown. Authored comparisons across distinct constitutions retain their captured source, explicit missing counterparts and exact reviewed passages. A later transcription revision marks the correspondence for review while keeping the original quotation pins.

The deterministic offline regression `e2e/full/legacy-migration.spec.ts` emits a JSON coverage report. Its fixtures are synthetic test data, not legal transcriptions. Actual extraction and historical interpretation remain the importer's responsibility. Packages requiring legal changeset reconstruction still depend on VER-46; this workflow imports complete supplied snapshots.

[[Editorial guide|Editorial-Guide]] · [[Deutsch|Migration-Guide-de]]
