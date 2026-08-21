---
name: domain-boundaries
description: Service ownership, write rules, and first-phase schema outline for Constitution Atlas. Use when adding domain APIs, tables, or events — not for infra-only or ping-endpoint work.
disable-model-invocation: true
---

# Domain boundaries

Ownership:

| Service | Writes |
| --- | --- |
| catalog | countries, constitutions, versions, sources |
| content | articles, blocks, revisions, article links |
| amendment | amendments, changes, version transitions |
| identity | users, roles, sessions |
| editor | drafts, edit sessions, publish actions |
| search | derived index only |
| ingestion | import jobs and staging |
| audit | append-only events |

Rules:
- No cross-service SQL. Compose reads in the gateway via HTTP.
- Search and audit consume events; they are not authorities for article text.
- Published versions are immutable snapshots.
- Prefer OpenAPI on each service over ad-hoc JSON.

For story IDs and table-level detail, grep `backlog.md` for the owning epic (`ARCH-`, `SRV-`, `DB-`). Do not load the whole file.
