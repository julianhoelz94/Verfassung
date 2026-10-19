<!-- Reviewed: 2026-10-19 -->
# Architecture

**Entry:** `docker-compose.yml`, `infra/caddy/`, `apps/gateway-web`, `services/`.
**Decisions:** ADRs 0001 (ownership), 0002 (immutable publication), 0005 (two version
axes), 0006 (shared immutable content).

Browser → Caddy → gateway server components/actions or `/api/<service>` routes.
Nine Spring Boot services each own a Postgres database. The existing TypeScript
MCP server exposes published browsing and scoped staging through those APIs.
Gateway and MCP have no database. Search and Audit are derived.

| Owner | Authoritative writes |
| --- | --- |
| Catalog | Countries, constitution identity/lifecycle and provision events, metadata/wiki/settings revisions, version chains and publication metadata |
| Content | Immutable ordered node/text revisions, version roots, rich content |
| Amendment | Legal change records, revision chains, exact before/after pins and review decisions |
| Identity | Accounts, sessions, MFA/passkeys, credentials/OAuth, browsing policy, mail/settings and durable deployment setup |
| Editor | Owned edit sessions, pinned drafts, review/approval and publication orchestration/outbox |
| Document | Document identity, immutable files/revisions, citation links and legal-page/contact publication |
| Ingestion | Staged jobs, batches, uploads, setup proposals and publication delivery outbox |
| Search | Rebuildable published-content index and generation-pinned search results |
| Audit | Append-only attributed events |

External IDs are copied opaque UUIDs. Never join databases or add cross-service FKs.
Shared transport, identity contracts and ordered content/diff types live in
`services/platform`; domain decisions remain in their owning service.

## API addresses

Browser: `/api/catalog/countries`. Compose caller:
`http://catalog-service:8080/countries`. Caddy strips `/api/catalog`; controllers
map paths at the service root. API docs are explicitly enabled for development/CI.

## Request flows

- Reading: gateway `lib/api.ts` composes Catalog/Content plus optional Amendment,
  Document and Search reads. Public results follow published legal identities and
  their current editorial snapshots; known historical snapshot links remain valid.
- Sign-in: Identity validates password/MFA/passkey and the gateway stores the
  HTTP-only `ca_session` cookie. A separate `ca_mfa_challenge` cookie pins MFA login.
- Editing: Editor owns an open session and pins source content/settings generations.
  Review and approval precede a fresh-MFA publisher action. Publication creates a
  successor; it never rewrites a published source. Outboxes retry side effects.
- Importing: Ingestion stages and validates proposals. Preparation writes drafts;
  independent review and explicit publication precede any public visibility.
- Setup: Identity persists bootstrap completion independently of deployments.
  Caddy/gateway and backend filters fail closed before setup, while allowing health,
  required login/enrollment and administrator/legal setup paths. Application
  exceptions after admission remain the downstream handler's responsibility.

## Access and transport

Services authenticate protected operations through Identity and enforce their own
roles/scopes. Gateway navigation is presentation, never an authorization boundary.
Identity owns saved anonymous policy; gateway and Caddy enforce browsing/rate policy.
Gateway counters are process-local and require a shared store before scaling.

Caddy owns direct TLS and certificate renewal; `infra/caddy/transport.py` supervises
readiness. External proxy mode checks explicit trusted CIDRs and forwarded HTTPS.
Local HTTP is loopback-only. Backend ports must remain private.

Kotlin service requests use the platform HTTP builder with 2 s connect / 5 s read
limits; import publication delivery preserves its explicit 60 s read limit.
Gateway requests use `lib/fetch-with-timeout.ts` with a 10 s default and retain
shorter caller deadlines/cancellation. Translation batches explicitly allow 30 s;
document streaming allows 60 s. Transports do not retry write commands.
