import assert from 'node:assert/strict';
import test from 'node:test';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { orderedText } from './server.js';
import { createServer } from './server.js';
import { requirePublishedVersion, UpstreamError } from './catalog.js';

test('ordered content preserves text and child order', () => {
  const text = orderedText([
    { type: 'text', text: 'Opening ' },
    { type: 'child', node: { content: [{ type: 'text', text: 'paragraph one' }] } },
    { type: 'text', text: ', then ' },
    { type: 'child', node: { content: [{ type: 'text', text: 'paragraph two' }] } },
  ]);
  assert.equal(text, 'Opening paragraph one, then paragraph two');
});

test('import schema explains settings and upload limits', async () => {
  const result = await callTool('get_import_schema', {});
  assert.equal(result.isError, undefined);
  const guidance = result.structuredContent?.settingsGuidance as Array<{ id: string; changeability: string }>;
  assert.ok(guidance.some(field => field.id === 'outline.kindCode' && field.changeability === 'set_once'));
  assert.ok(guidance.some(field => field.id === 'outline.presentation' && field.changeability === 'impact_review'));
  assert.equal((result.structuredContent?.uploadLimits as { chunkBytes: number }).chunkBytes, 524288);
});

test('direct reads reject an unpublished version without disclosing its status', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ id: 'draft', publicationStatus: 'draft', listing: 'public' });
  try {
    await assert.rejects(requirePublishedVersion('draft'), (error) => error instanceof UpstreamError && error.status === 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('direct reads reject published staff-only versions', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ id: 'staff', publicationStatus: 'published', listing: 'staff' });
  try {
    await assert.rejects(requirePublishedVersion('staff'), (error) => error instanceof UpstreamError && error.status === 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

async function callTool(name: string, args: Record<string, unknown>, authorization?: string): Promise<{ isError?: boolean; structuredContent?: Record<string, unknown> }> {
  const handler = createMcpHandler(ctx => createServer(ctx.requestInfo?.headers.get('authorization') ?? undefined));
  const request = new Request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': 'tools/call',
      'Mcp-Name': name,
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name, arguments: args, _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientCapabilities': {},
      } },
    }),
  });
  const response = await handler.fetch(request);
  assert.equal(response.status, 200);
  const body = await response.json() as { result: { isError?: boolean; structuredContent?: Record<string, unknown> } };
  return body.result;
}

test('MCP countries list omits countries with no published version', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json([
    { isoCode: 'DE', name: 'Germany', versionCount: 1 },
    { isoCode: 'ZZ', name: 'Pending', versionCount: 0 },
  ]);
  try {
    const result = await callTool('list_countries', {});
    assert.deepEqual((result.structuredContent?.countries as Array<{ isoCode: string }>).map(country => country.isoCode), ['DE']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('MCP direct outline read rejects a draft before fetching settings', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return Response.json({ publicationStatus: 'draft', listing: 'public' }); };
  try {
    const result = await callTool('get_constitution_outline', { versionId: '00000000-0000-4000-8000-000000000001' });
    assert.equal(result.isError, true);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('MCP staging requires an import-scoped personal key', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ scopes: ['mcp:read'] }); };
  try {
    const payload = { isoCode: 'FR', countryName: 'France', constitutionSlug: '1958', constitutionTitle: 'Constitution', versionLabel: '1', articles: [{ articleNumber: '1', title: 'First', sortOrder: 1 }] };
    assert.equal((await callTool('stage_constitution_import', { payload })).isError, true);
    assert.equal(calls, 0);
    assert.equal((await callTool('stage_constitution_import', { payload }, 'Bearer ca_mcp_readonly')).isError, true);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('MCP import key stages a pending job and never publishes', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' });
    if (String(input).endsWith('/me')) return Response.json({ scopes: ['mcp:read', 'ingestion:import'] });
    return Response.json({ id: '01900000-0000-4000-8000-000000000001', status: 'pending_review', errors: [] });
  };
  try {
    const result = await callTool('stage_constitution_import', { payload: { isoCode: 'FR', constitutionId: '01900000-0000-4000-8000-000000000002', settingsRevisionId: '01900000-0000-4000-8000-000000000003' } }, 'Bearer ca_mcp_editor');
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent?.status, 'pending_review');
    assert.deepEqual(calls.map(call => call.method), ['GET', 'POST']);
    assert.equal(calls.some(call => call.url.includes('/publish')), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('MCP import key refuses an unpinned full upload before calling ingestion', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async input => {
    calls.push(String(input));
    return Response.json({ scopes: ['ingestion:import'] });
  };
  try {
    const result = await callTool('stage_constitution_import', { payload: { isoCode: 'FR', outline: { kinds: [] } } }, 'Bearer ca_mcp_editor');
    assert.equal(result.isError, true);
    assert.deepEqual(calls.map(url => new URL(url).pathname), ['/me']);
  } finally { globalThis.fetch = originalFetch; }
});
