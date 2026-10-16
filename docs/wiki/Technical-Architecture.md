# Architecture and data ownership

Constitution Atlas is a Next.js gateway in front of Kotlin/Spring Boot services. Caddy sends website requests to the gateway and `/api/<service>` requests to the corresponding service. The gateway has no database. Each stateful service owns its Postgres database; services communicate over HTTP and shared opaque IDs, without cross-database foreign keys.

| Component | Responsibility |
| --- | --- |
| Catalog | Countries, constitutions, outlines, versions, and publication metadata. |
| Content | Versioned constitutional text and ordered content nodes. |
| Amendment | Legal changes, transitions, revisions, and exact change links. |
| Identity | Accounts, roles, sessions, registration, confirmation mail, SMTP settings, MFA, and passkeys. |
| Editor | Draft sessions, review state, and publication commands. |
| Ingestion | Upload/import jobs and staging before review. |
| Document | Source files and revisions, constitution/legal-change links, contextual page media, and legal-page content. |
| Search | Derived index over published material; rebuilt from source services. |
| Audit | Append-only activity events; not a source of constitutional text. |

The source-of-truth boundaries should be checked against the current [repository map](https://github.com/julianhoelz94/Verfassung/blob/main/docs/CODEMAPS/INDEX.md) and [ADR 0001](https://github.com/julianhoelz94/Verfassung/blob/main/docs/adr/0001-platform-boundaries.md) when adding a feature.

## Main flows

- **Read:** browser → Caddy → gateway server component → Catalog/Content (and, for context, Amendment or Document). Public responses use published snapshots.
- **Anonymous access:** Identity owns the saved browsing policy. The gateway checks it before showing catalog/navigation or allowing direct reader routes. Caddy asks the gateway edge limiter to enforce the configured per-IP and aggregate API rates for unsigned requests; blocked browsing returns 403, while an exceeded rate returns 429 with `Retry-After`. Sign-in and account creation routes remain available. The limiter currently keeps counters in the gateway process, so multiple gateway replicas need a shared counter store to enforce one aggregate limit.
- **Sign in:** gateway server action → Identity; session cookie is `ca_session`. MFA challenges use a separate short-lived flow.
- **Register:** when enabled by an administrator, Identity accepts an email request and sends a one-use confirmation link. The account remains disabled until the recipient sets a password and initially has only the viewer role. Identity stores SMTP settings and verifies passkeys against the configured public origin.
- **Publish:** an Editor session is saved, reviewed, and approved; a publisher with fresh MFA creates a successor version. Content and Catalog publish the new snapshot, and Search is asked to reindex. The former snapshot remains immutable.
- **Import:** Ingestion stages proposed content. Separate reviewer and publisher actions are required before public visibility; no upload by itself publishes content.

Version history has two axes: legal changes and editorial corrections. The legal identity and its source revision must be kept separate; see [ADR 0005](https://github.com/julianhoelz94/Verfassung/blob/main/docs/adr/0005-two-axis-versions.md) and the [design](https://github.com/julianhoelz94/Verfassung/blob/main/docs/design/two-axis-versions.md).

## API addresses

Through Caddy, a browser calls `/api/catalog/countries`. Within Compose, a service or gateway calls `http://catalog-service:8080/countries`; the `/api/catalog` prefix is stripped at the edge. Consult the [Caddy configuration](https://github.com/julianhoelz94/Verfassung/blob/main/infra/caddy/Caddyfile) and [API map](https://github.com/julianhoelz94/Verfassung/blob/main/docs/CODEMAPS/backend.md) before adding routes.

[[Development and operations|Technical-Development]] · [[Documentation home|Home]]
