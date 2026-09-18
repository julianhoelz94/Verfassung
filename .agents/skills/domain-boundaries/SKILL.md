---
name: domain-boundaries
description: Service ownership and write boundaries for domain APIs, schemas, or events.
---

Use `docs/CODEMAPS/architecture.md` for ownership and `docs/CODEMAPS/data.md` for tables. Write only to the owning service's database; compose cross-service reads over HTTP/events. Search and audit are derived, and published versions are immutable. Use service OpenAPI contracts. For tracked work, follow root `AGENTS.md` and Linear.
