# 0003 — Domain event names

Status: Accepted  
Date: 2026-09-08

## Context

Editor publish (ED-4) copies a source tree onto a new catalog version, then notified search and (best-effort) audit over HTTP inside the same request. Failures were logged and swallowed, so a published snapshot could exist without a search index update and with no durable retry (Q-8). ADR 0001 allowed a per-service outbox later; ADR 0002 deferred that retry to PLAT-6.

There is still no message broker.

## Decision

These event names and JSON fields are the contract. They are stored on the **editor** `outbox_events` table (PLAT-6), not published to Kafka or similar. Extra JSON fields are allowed; consumers must ignore names they do not know. Consumers must be **idempotent**.

### `version.published`

Emitted after catalog `POST /versions/{id}/publish` succeeds for an editorial successor.

| Field | Type |
| --- | --- |
| `sourceVersionId` | UUID |
| `newVersionId` | UUID |
| `constitutionId` | UUID |
| `actorId` | UUID |

### `amendment.recorded`

Emitted when amendment-service `POST /transitions` returns a transition id.

| Field | Type |
| --- | --- |
| `transitionId` | UUID |
| `sourceVersionId` | UUID |
| `targetVersionId` | UUID |

### `search.reindex-requested`

Emitted in the same editor commit as `version.published`. A scheduler delivers it by calling search `POST /reindex` until `published_at` is set.

| Field | Type |
| --- | --- |
| `versionId` | UUID (the successor that triggered the rebuild) |

Search reindex is currently a full rebuild; `versionId` records why the event was written. Repeating the HTTP call is safe.

`published_at` on `version.published` and `amendment.recorded` is set when the row is inserted (there is no broker consumer). Only `search.reindex-requested` stays unpublished until the scheduler successfully calls search `POST /reindex`.

## Consequences

- `EditorService.publish` does not call search inline. The session may already be `published` while preview `searchIndexStatus` is `pending` or `failed`.
- Audit append stays synchronous HTTP and may still be logged-and-continued; it is not on this outbox.
- Field names stay stable so later brokers or extra consumers can subscribe without renaming.
