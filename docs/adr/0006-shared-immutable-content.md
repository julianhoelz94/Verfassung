# 0006 — Shared immutable content revisions

Status: Accepted
Date: 2026-09-27
Tracked by: VER-224 (ARCH-9), Sprint 40

## Decision

Content-service owns ordered immutable node and text revisions. Catalog continues
to own legal/editorial snapshots (ADR 0005), their publication state and pinned
structural settings. Neither service queries the other's database.

Four identities have distinct meanings:

| Identity | Meaning |
| --- | --- |
| `versionId` | One catalog snapshot on either version axis |
| `logicalId` | A unit's identity across edits and moves |
| `revisionId` | Immutable wording, metadata and ordered references |
| `occurrenceId` | A unit's public identity in one snapshot |

An occurrence belongs to exactly one version, logical unit and revision. A revision
may be reached by many versions of the same constitution. Public links identify
occurrences or a version plus logical identity; a revision UUID alone is never a
public snapshot address. Imported legacy node IDs become occurrence aliases and
continue to resolve their original version. Predecessor IDs on legacy responses
identify predecessor occurrences, not shared revision IDs.

## Storage and integrity

`content_snapshots` records version, constitution, structural settings revision and
an optimistic root generation. Ordered `content_roots` reference node revisions.
`node_revisions` stores logical identity, kind, literal label, editorial title and
predecessor revision. Its ordered `content_entries` contains either a text revision
reference or a child node revision reference, never both. `text_revisions` stores
logical identity, exact text and predecessor revision. Split/merge lineage is an
ordered list of source text revision IDs. Occurrences and legacy aliases provide
version membership and historic permalink resolution.

Unique positions enforce order under each node and at roots. All reference keys
include constitution identity. Writes validate a complete resolved tree: no cycles,
duplicate logical units, duplicate child references, gaps in supplied positions,
invalid kind transitions or title/label/text permission violations. Empty text is
preserved; punctuation does not infer children. Only array order is authoritative.
Compatibility parent/sort columns must not be another write model.

Revisions are append-only even before publication. A root replacement is one local
transaction: lock the snapshot, compare generation, insert revisions and occurrences,
validate membership, replace root references, increment generation. Published roots
are immutable. Catalog lookup must succeed and confirm a writable snapshot before a
write; an unknown/unavailable version is rejected. Constitution and settings pins
come from catalog over HTTP, never a client-supplied trusted UUID.

## Version-aware API

* `GET /versions/{versionId}/content` returns ordered roots and snapshot generation.
* `PUT /versions/{versionId}/content` accepts expected generation, ordered roots and
  nested `content` entries. A reference to an existing revision reuses that subtree.
  A changed node supplies its logical ID, predecessor revision and complete local
  entry sequence; unchanged descendants remain revision references.
* `GET /versions/{versionId}/resolve?logicalId=…` resolves a node or text entry under
  that version's roots. Return logical/revision/occurrence identity, kind, parent,
  breadcrumbs, exact text and a stable deep link. An unrelated revision is 404.
* Existing `/articles/{occurrenceId}` and version article lists remain lossless for
  unmixed trees. Mixed reads include canonical ordered content. Legacy writes that
  would omit or flatten mixed entries return 409; ambiguous `content` plus
  `body`/`children` payloads return 400.

Drafts pin source version, settings revision, generation and roots. Saving a text
edit records a targeted operation with expected source revision. Split/merge is
limited to adjacent text entries of one parent; moving across a child is explicit.
Save/reopen retains source identities and operation order. Stale sources fail before
any revision changes. Publish resolves operations into changed revisions and their
ancestor paths, retaining untouched references.

## Sharing example

Version A resolves article revision A1 → paragraph P1 → sentences S1 and S2.
S1 references T1 and S2 references T2. Changing T1 creates T1b, S1b, P1b and A1b.
Version B roots at A1b; S2 and T2 are shared without new text or subtree rows.
Version A still resolves A1/P1/S1/T1. B gets new occurrence addresses, with
predecessor aliases back to A; both occurrence addresses for S2 resolve its same
revision. A literal `46a`, `bis` or `(2a)` label is copied exactly.

## Migration and consumers

Backfill all legacy versions transactionally, preserving node UUID aliases, labels,
titles, body bytes and child order (`sort_order`, then UUID for ties). Body precedes
children, matching the existing reader; record `orderInferred` for body-plus-child
nodes. V6's deleted parent text is unrecoverable. Backfill does not deduplicate
historical revisions by guessing identity from matching wording. Use existing
predecessor links for lineage, otherwise allocate distinct logical identities.
Compare old/new ordered projections and legacy URL resolution before enabling writes.

Article history follows occurrence predecessor lineage. Amendment pins retain both
version and logical/occurrence identity, and verify membership. Compare matches
logical units before comparing revisions. Search indexes occurrence links scoped to
the requested version. Imports write outline-defined roots and explicit sequences.
All plain-text consumers traverse the same ordered content; separators are explicit
renderer/projection policy, never punctuation-based restructuring.

## Publication, retry and retention

Editor reserves a catalog draft successor with a stable publish attempt ID, writes
the content snapshot atomically, then publishes catalog. Retries reuse that successor
and verify root generation/hash rather than creating another snapshot. A failure
before catalog publication leaves a recoverable draft; no public root or predecessor
changes. A failure after catalog publication resumes outbox delivery and amendment
linking without changing content. Catalog publication must require the completed
content/settings pins; distributed calls are a retryable workflow, not a database
transaction. An editorial successor inherits its source structural revision unless
an explicitly reviewed structural migration is part of the successor.

No revision reachable from any retained snapshot, draft source, amendment pin or
legacy alias may be collected. Cleanup of failed attempts removes only unattached
draft snapshots and revisions proven unreachable. Deleting a version must preserve
its published permalink tombstone/alias policy and cannot cascade into shared
revisions. Database foreign keys restrict referenced deletion. Retention is explicit;
automatic age-based deletion of content revisions is forbidden.
