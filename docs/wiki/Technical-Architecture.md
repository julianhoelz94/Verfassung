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

## Deployment setup and transport

Identity owns durable setup state, the designated bootstrap administrator, deferred email, and the website language policy. Document owns operator details and legal-page drafts/publications. The gateway remains database-free. A setup restriction is enforced at Caddy, the gateway, Identity authentication, and the shared service filter. Until completion, only the bootstrap administrator can use setup operations; content APIs and existing machine/client credentials stay blocked. Existing databases with users receive an explicit legacy-installation migration so an upgrade does not unexpectedly lock out an established site.

Caddy owns direct certificate issuance/renewal with Let's Encrypt HTTP-01. Its supervisor presents credential-free HTTP progress, verifies the issued TLS certificate, and redirects to HTTPS. Caddy's admin socket is private. In external-proxy mode, configured proxy CIDRs and forwarded HTTPS are required; the external proxy owns issuance/renewal. Direct backend ports must remain private. Production rejects local HTTP and CI fixture exceptions.

Configuration is evaluated from actual runtime environment values and owning-service storage. Nonblank environment overrides mask saved values without replacing them. Removing the override restores the saved configuration. Legal environment values prefill private operator drafts; they require save/review/publication and cannot silently rewrite published revisions.

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
