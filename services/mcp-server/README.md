# Constitution Atlas MCP server

The remote MCP endpoint is `/mcp` through Caddy. This service has no database. It
calls Catalog, Content, Search, Identity, and Ingestion over HTTP. Every MCP
request requires a personal key or an OAuth access token from a signed-in account. Read tools are:

- `list_countries`, `list_constitutions`, `list_versions`
- `get_constitution_outline`, `list_units`, `read_unit`, `resolve_unit`
- `search_constitutions`

Any signed-in user can create a read key in **Account → MCP keys**. An editor or
admin can create a personal import-scoped key in **Account → MCP
keys**. Import keys require enrolled MFA and a recent authenticator confirmation.
The secret is displayed once and can be rotated or revoked from Account.
Personal keys are rechecked against current roles on every request. An import
key can stage content and read its own status; it cannot approve, reject, or
publish.

The import tools are `get_import_schema`, `find_constitution`, `get_import_setup`,
`propose_constitution_setup`, `get_setup_proposal`, `revise_setup_proposal`,
`stage_constitution_import`, `create_import_batch`, `stage_batch_item`,
`get_import_batch`, `get_import_job`, `begin_import_upload`, `put_import_chunk`,
`get_import_upload`, `cancel_import_upload`, and `complete_import_upload`. The server accepts a personal key in
`Authorization: Bearer ca_mcp_…`, or an OAuth token in `Authorization: Bearer ca_oauth_…`
whose resource is this deployment's `/mcp` URL. For an existing constitution, call
`get_import_setup` and include its `settingsRevisionId` in the payload; omit
`outline`. For a new constitution, submit a private setup proposal with a small
source sample. An editor checks its sample and confirms the outline in the site;
the proposal then returns a constitution ID and settings revision for upload.
Every staged item stays pending review. A reviewer records a reasoned
decision in the site; a publisher with fresh MFA publishes the approved draft.
The MCP server has no review or publish tool.

Direct version reads check Catalog's publication status and public listing,
including the current published editorial tip, before fetching Content.
Countries and constitutions without a published version are
omitted. The Search service indexes published content. Tool arguments and text
responses are bounded. The endpoint serves MCP revision 2026-07-28 and the
SDK's stateless legacy compatibility mode.

Failed or missing authentication returns HTTP 429 after 120 rejection responses
per client IP per minute. Invalid bearer tokens still reach Identity before this
response limit is checked; this does not cap authentication attempts sent upstream.
The limiter retains at most 10,000 live client windows; at capacity, unknown
clients receive HTTP 429 until a window expires, without resetting any existing
client's quota. Separate concurrency limits bound in-flight authentication and
tool requests to 32 globally, authentication to 8 per client IP, and authenticated
tool requests to 8 per actor.
These limits are process-local; multiple replicas require coordinated limits.
Caddy must remain the trusted entry point that supplies the client IP header.

Locally, `./manageLocalStack.sh --start` starts the service and exposes
`http://localhost/mcp`; `http://localhost/mcp/ping` is its health check. Run
`npm ci && npm test` in this directory for its focused checks. The Docker image
builds from the committed package lockfile. Host checks use Node 22 and matching
Node 22 type declarations. TypeScript 7 runs through its native `tsc` CLI; keep
optional dependencies enabled during the build so npm selects the compiler for
the build platform. The production stage contains only emitted JavaScript and
runtime dependencies.

An import batch accepts at most 100 items. Each item has its own idempotency
key, checksum, validation errors, and review status. For a large JSON item,
start a resumable upload with the complete UTF-8 byte count and SHA-256 digest.
Send 512 KiB base64 chunks by zero-based index (the last chunk can be shorter),
each with its own SHA-256 digest. Poll `get_import_upload` for missing indices,
then complete it. Items are limited to 25 MiB, outstanding uploads to 100 MiB
per batch, and incomplete upload handles expire after seven days. Completion
stages an item for review and does not publish it.

Ingestion uses separate service tokens for Catalog publication, Audit append,
and Search reindex. The local stack seeds all three. Production operators must
provision the three scopes separately. Published import events are queued in
Ingestion's database and delivered with retries.

## Website confirmation and revisions

After `propose_constitution_setup` or `revise_setup_proposal`, follow the returned
`nextAction` and `instructions`. `wait_for_confirmation` means stop, show the
`previewUrl`, and wait for the editor to confirm on the website. Do not confirm
on the user's behalf or repeatedly poll. When the user resumes, read
`get_setup_proposal` again. Only `confirmed` enables full upload; use its
constitution/settings pin. Structure confirmation is separate from content
approval and publication.

The website displays the submitted hierarchy read-only, the actual sample, and
editable display settings. Manual constitution creation retains its full outline
editor. Website change requests are available as `requestedChanges` with
`changesRequested=true`; read them and revise hierarchy and sample together.
`revise_setup_proposal` requires `expectedRevision` from the latest read. A stale
revision is rejected, including stale website saves and confirmation. Website
saved display preferences are preserved for matching kind codes. The previous
chat payload remains available for comparison. A revision clears the pending
change-request flag, retains its text for review, and requires fresh website
confirmation. No feedback is sent to the external chat automatically.
