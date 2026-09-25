# Sprint 47: API prepopulation for full-stack journeys

## Goal

Replace the mock-backed Playwright journey setup with a real gateway and service stack. Generate deterministic JSON fixtures, upload them through the owning HTTP APIs with `npm run prepopulate`, and make that command a test: it fails unless read-back proves that the expected data was created. Do not add a database migration or write directly to service databases.

The one-time removal of the old Germany demo seed from the catalog, content, and amendment migrations is part of this sprint. Fresh databases now start without that sample constitution. Existing local volumes have old rows and Flyway checksums; reset the disposable local stack with `./manageLocalStack.sh --reset` before starting the changed migrations. Do not run that reset against a database whose contents must be kept.

## Fixture set

Add `npm run fixtures:generate` in `apps/gateway-web`. It writes a versioned manifest and separate JSON payloads under `e2e/fixtures/generated/`. Generation is deterministic: stable slugs, article numbers, dates, titles, and text; no credentials or generated database UUIDs. Validate the generated payloads against import rules before writing them. Commit the generated files so a fixture change is reviewable; CI regenerates them and fails on a diff.

Use a reserved fixture prefix for two synthetic countries and two constitutions. One constitution has three published legal versions and the other has two. Give every version 12 numbered articles (60 article snapshots total), nested outline nodes, source metadata, and distinct search terms. Across successive versions include an addition, a removal, a changed article, and an unchanged article. Provide an amendment record for each legal transition, including dates, affected articles, citations, and document links. Include at least one record with a later revision so history can be tested. The manifest records expected counts and semantic assertions for each version and transition. Keep baseline records separate from records that browser tests will create or mutate.

These are synthetic test records, not historical claims. Document links may point to controlled test assets; the test must not depend on a third-party site being available.

## Import and API work

1. Extend the ingestion request and catalog client to accept a predecessor version ID and legal hop kind. The current ingestion API can import the first version but cannot append a version to an existing chain. Keep initial imports backward compatible. Test first import, successor import, invalid predecessor, and repeat behavior in the ingestion service.
2. The uploader reads the manifest in dependency order, imports each constitution version with `POST /api/ingestion/import-jobs`, polls the job to completion, and resolves each returned version ID for the next import. It then creates amendment records and revisions through the amendment API, using those IDs. Use the identity API for any additional fixture accounts. The existing create-only CI identity seed supplies the bootstrap administrator and service token; credentials come from environment variables, never fixture JSON.
3. Trigger search reindex through `POST /api/search/reindex` after imports and poll for the expected indexed results. Store the resolved ID map in an ignored fixture runtime directory outside Playwright's cleaned output, for the browser tests to consume.
4. Make upload idempotent. Find records by fixture namespace and stable slug or label. Skip an exact match; fail with a field-level mismatch if a published record differs. Do not overwrite immutable published versions. A second run must preserve IDs and counts.

## `prepopulate` is an assertion-bearing test

`npm run prepopulate` generates fixtures, checks that the target is an explicitly configured local or CI test stack, waits for required APIs, uploads missing records, and reads them back through public or authorized service APIs. It exits nonzero on an import failure, timeout, mismatch, or missing search index. Add `npm run prepopulate -- --verify-only` for read-back without writes.

Read-back assertions must check the namespaced fixture totals (2 countries, 2 constitutions, 5 published versions, 60 article snapshots, and one amendment per legal transition), per-version article numbers and outline nodes, exact predecessor links, amendment status/source/target/documents/revision count, and expected search hits and filters. Assert counts within the fixture namespace rather than global database totals, since existing demo data may be present. Run `prepopulate` twice in CI and assert the second run leaves the same IDs and totals. Report expected versus actual values by resource when it fails.

## Real browser journeys

Add a separate Playwright project or command, `npm run test:e2e:full`, against the running Caddy/gateway stack. Use the fixture ID map and normal login through the website. Browser requests must reach real service APIs; route interception is limited to deliberately simulated external failures in tests whose purpose is failure handling. Cover the implemented stories in `docs/user-stories.md`: country and version reading, article navigation, search/filter, comparison and history, amendment timeline/documents, account and role visibility, editor draft/review/publish, and administrator import/access flows. Use fresh, namespaced records for mutating journeys so test order and retries do not change the baseline. Keep existing component-style mock tests as a separate fast suite and label them accurately.

Map every automated story to a test ID in a coverage table. Mark stories that are still **Planned** as unavailable rather than counting them as passing journeys. Include negative role checks, but avoid asserting implementation details such as internal service calls when the user-visible result is sufficient.

The current mapping is in [sprint-47-story-coverage.md](sprint-47-story-coverage.md).

## CI sequence and acceptance

Create a full-stack CI job with identity, catalog, content, ingestion, amendment, editor, audit, search, gateway, and Caddy. After health checks: install dependencies, regenerate and diff fixtures, run `prepopulate`, run it again to prove idempotence, run `prepopulate -- --verify-only`, then run the full-stack Playwright suite. Emit service logs and uploader diagnostics on failure. Keep browser traces local to the runner because they may contain session data. Keep the existing fast mocked suite distinct.

Sprint 47 acceptance requires the real-stack job to pass in CI, with no Playwright API mocks in the full-stack project; exact fixture assertions passing after upload and on rerun; all implemented user-journey stories mapped to passing tests; and the sprint's required review, verification, PR checks, merge, and Linear updates completed. This plan belongs to Sprint 47 and does not start Sprint 48.
