# Constitution Atlas MCP server

The remote MCP endpoint is `/mcp` through Caddy. This service has no database. It
calls Catalog, Content, and Search over HTTP and currently exposes public read
tools only:

- `list_countries`, `list_constitutions`, `list_versions`
- `get_constitution_outline`, `list_units`, `read_unit`, `resolve_unit`
- `search_constitutions`

Direct version reads check Catalog's publication status and public listing before
fetching Content. Countries and constitutions without a published version are
omitted. The Search service indexes published content. Tool arguments and text
responses are bounded. The endpoint serves MCP revision 2026-07-28 and the
SDK's stateless legacy compatibility mode.

Locally, `./manageLocalStack.sh --start` starts the service and exposes
`http://localhost/mcp`; `http://localhost/mcp/ping` is its health check. Run
`npm ci && npm test` in this directory for its focused checks. The Docker image
builds from the committed package lockfile.

The planned staff setup, import, and credential flow is tracked separately in
Sprint 51. Until those paths are implemented, the server must remain read-only.
