# 0002 — Immutable published versions

Status: Accepted  
Date: 2026-09-06

## Context

ARCH-2 already says a version is a full snapshot: later versions must not mutate older rows. QLT-5 still patched public article text in place on publish (`EDITOR_PUBLISH_PUBLIC`), so a `publication_status = published` catalog version could change bytes after readers had seen it.

## Decision

- A catalog version with `publication_status = published` is an immutable snapshot. Its content tree is never rewritten.
- Corrections and errata are a **new** catalog version (optional `provenance = official` plus a note), never `PATCH` / `PUT` on the old `versionId`.
- Catalog exposes `GET /versions/{versionId}` with `publicationStatus` so writers can see drafts that public country reads omit.
- Content mutating APIs refuse writes when catalog says the version is published (`409` / `version_published`). If catalog is unreachable they refuse with `503` rather than guessing.
- Editor publish copies the source tree onto a new draft version, applies session drafts only to that copy, then publishes the successor.

ARCH-2 remains the logical rule. QLT-5 in-place rewrite is removed (ED-4 / QLT-9).

## Consequences

- Public `GET` of a published version’s articles is stable across later editorial publish.
- Search reindex after catalog publish is written to the editor outbox as `search.reindex-requested` (ADR 0003 / PLAT-6) and retried by a scheduler. The session may already be `published`; retry does not mint another successor. Audit append after publish is still best-effort HTTP (logged on failure).
- Amendment records between source and successor land via `POST /transitions` (AMD-5); a failed call is logged and the publish still commits. On success the editor also records `amendment.recorded` on the outbox.
