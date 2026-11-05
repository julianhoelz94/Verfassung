import assert from 'node:assert/strict';
import test from 'node:test';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createServer } from './server.js';
import { UpstreamError } from './catalog.js';
import { CursorError } from './cursor.js';

const id = '01900000-0000-4000-8000-000000000001';
const actor = '01900000-0000-4000-8000-000000000099';

type Result = { isError?: boolean; structuredContent?: Record<string, unknown>; content?: Array<{ text?: string }> };

/** Invokes the existing public protocol entry point, including its declared tool output contract. */
async function invokeMigration(): Promise<Result> {
  const handler = createMcpHandler(() => createServer('Bearer ca_mcp_contract'));
  const response = await handler.fetch(new Request('http://localhost/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': 'get_migration_run' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_migration_run', arguments: { runId: id }, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} } } }),
  }));
  assert.equal(response.status, 200);
  return (await response.json() as { result: Result }).result;
}

/** Captures only tool audit output and restores all process hooks even after an assertion fails. */
async function withAudit(action: (audit: Array<Record<string, unknown>>) => Promise<void>) {
  const fetch = globalThis.fetch;
  const info = console.info;
  const warn = console.warn;
  const now = Date.now;
  const audit: Array<Record<string, unknown>> = [];
  console.info = value => { audit.push(JSON.parse(String(value))); };
  console.warn = value => { audit.push(JSON.parse(String(value))); };
  Date.now = () => 1000;
  try { await action(audit); }
  finally { globalThis.fetch = fetch; console.info = info; console.warn = warn; Date.now = now; }
}

for (const [status, code] of [[400, 'invalid_input'], [401, 'unauthenticated'], [403, 'forbidden'], [404, 'not_found'], [409, 'conflict'], [413, 'payload_too_large'], [429, 'upstream_unavailable'], [502, 'upstream_unavailable']] as const) {
  test(`tool logging retains upstream ${status} mapping and safe audit data`, async () => withAudit(async audit => {
    const error = new UpstreamError(status, 'ingestion', 'Exact correction detail.');
    globalThis.fetch = async () => { throw error; };
    const result = await invokeMigration();
    assert.deepEqual(result.structuredContent, { code, status, message: error.message, retryable: status === 429 || status >= 500 });
    assert.equal(result.isError, true);
    assert.deepEqual(audit, [{ event: 'mcp_tool', tool: 'get_migration_run', outcome: 'error', status, elapsedMs: 0 }]);
    assert.ok(!JSON.stringify(audit).includes('ca_mcp_contract'));
  }));
}

test('cursor errors keep their public message while unexpected errors remain redacted', async () => withAudit(async audit => {
  globalThis.fetch = async () => { throw new CursorError('Collection changed; restart pagination'); };
  assert.deepEqual((await invokeMigration()).structuredContent, { code: 'invalid_cursor', status: 400, message: 'Collection changed; restart pagination', retryable: false });
  globalThis.fetch = async () => { throw new Error('SECRET transport detail'); };
  assert.deepEqual((await invokeMigration()).structuredContent, { code: 'upstream_unavailable', status: 503, message: 'The requested data could not be loaded.', retryable: true });
  assert.ok(!JSON.stringify(audit).includes('SECRET'));
}));

test('success audit keeps nullish resource precedence and resolves the authenticated actor after action', async () => withAudit(async audit => {
  globalThis.fetch = async input => String(input).endsWith('/me')
    ? Response.json({ id: actor, scopes: ['ingestion:import'] })
    : Response.json({ id, ownerId: actor, manifest: {}, items: [], coverage: {}, jobId: '', itemId: 'later' });
  assert.equal((await invokeMigration()).isError, undefined);
  assert.deepEqual(audit, [{ event: 'mcp_tool', tool: 'get_migration_run', actorId: actor, resourceId: '', outcome: 'ok', elapsedMs: 0 }]);
}));

test('an audit write failure is still caught by the tool wrapper', async () => withAudit(async audit => {
  globalThis.fetch = async input => String(input).endsWith('/me')
    ? Response.json({ id: actor, scopes: ['ingestion:import'] })
    : Response.json({ id, ownerId: actor, manifest: {}, items: [], coverage: {} });
  console.info = () => { throw new Error('SECRET logging failure'); };
  assert.deepEqual((await invokeMigration()).structuredContent, { code: 'upstream_unavailable', status: 503, message: 'The requested data could not be loaded.', retryable: true });
  assert.deepEqual(audit, [{ event: 'mcp_tool', tool: 'get_migration_run', actorId: actor, outcome: 'error', status: 503, elapsedMs: 0 }]);
}));
