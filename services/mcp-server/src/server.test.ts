import assert from 'node:assert/strict';
import test from 'node:test';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { orderedText } from './server.js';
import { createServer } from './server.js';
import { authenticateMcpKey, requirePublishedVersion, UpstreamError } from './catalog.js';
import { setupProposalSchema } from './import-schema.js';
import { randomUUID } from 'node:crypto';

test('rich imports survive the actual MCP parser for direct and batch staging', async () => {
  const originalFetch = globalThis.fetch;
  const noteId = randomUUID();
  const root = { logicalId: randomUUID(), kind: 'article', label: 'I a', title: null, content: [
    { type: 'text', text: 'Wort', references: [{ logicalId: randomUUID(), start: 0, end: 4, target: { type: 'footnote', footnoteId: noteId } }] },
    { type: 'text', logicalId: noteId, text: 'Anmerkung: spätere Redaktion.', format: 'footnote', footnoteLabel: '*' },
    { type: 'text', format: 'table', table: { caption: 'Übersicht', rows: [{ logicalId: randomUUID(), cells: [{ logicalId: randomUUID(), text: 'unverändert', header: true, rowSpan: 2, colSpan: 1, headers: [] }] }] } },
  ] };
  const payload = { isoCode: 'DE', countryName: 'Deutschland', constitutionSlug: 'archiv', constitutionTitle: 'Verfassung', versionLabel: '1849', constitutionId: randomUUID(), settingsRevisionId: randomUUID(), roots: [root] };
  let received: unknown;
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/me')) return Response.json({ scopes: ['ingestion:import'] });
    received = JSON.parse(String(init?.body));
    return Response.json({ id: randomUUID(), status: 'pending_review', errors: [] });
  };
  try {
    assert.equal((await callTool('stage_constitution_import', { payload }, 'Bearer ca_mcp_importer')).isError, undefined);
    assert.deepEqual(received, payload);
    assert.equal((await callTool('stage_batch_item', { batchId: randomUUID(), idempotencyKey: 'source-item-1849', payload }, 'Bearer ca_mcp_importer')).isError, undefined);
    assert.deepEqual((received as unknown as { payload: unknown }).payload, payload);
    received = undefined;
    const invalid = { ...payload, roots: [{ ...root, accidentalField: 'must not disappear' }] };
    assert.equal((await callTool('stage_constitution_import', { payload: invalid }, 'Bearer ca_mcp_importer')).isError, true);
    assert.equal(received, undefined);
    const outline = { kinds: [{ kindCode: 'article', displayLabel: 'Artikel', root: true, allowedChildKinds: [] }] };
    assert.deepEqual(setupProposalSchema.parse({ isoCode: 'DE', countryName: 'Deutschland', constitutionSlug: 'archiv', constitutionTitle: 'Verfassung', outline, sampleRoots: [root] }).outline, outline);
  } finally { globalThis.fetch = originalFetch; }
});

test('MCP outline choices match catalog authoring policies', () => {
  const proposal = {
    isoCode: 'FR', countryName: 'France', constitutionSlug: 'constitution', constitutionTitle: 'Constitution',
    outline: { kinds: [{ kindCode: 'article', displayLabel: 'Article', titlePolicy: 'none', labelPolicy: 'required' }] },
  };
  assert.equal(setupProposalSchema.safeParse(proposal).success, true);
  assert.equal(setupProposalSchema.safeParse({ ...proposal, outline: { kinds: [{ ...proposal.outline.kinds[0], kindCode: 'x'.repeat(33) }] } }).success, false);
});

test('jurisdiction discovery and import setup preserve historical identities without country codes', async () => {
  const originalFetch = globalThis.fetch;
  const jurisdictionId = randomUUID();
  const constitutionId = randomUUID();
  const settings = randomUUID();
  const calls: string[] = [];
  globalThis.fetch = async input => {
    const path = new URL(String(input)).pathname;
    calls.push(path);
    if (path === '/me') return Response.json({ scopes: ['ingestion:import'] });
    if (path === `/jurisdictions/${jurisdictionId}`) return Response.json({ jurisdiction: { id: jurisdictionId, name: 'Preußen', historical: true }, constitutions: [{ id: constitutionId, slug: '1850', title: 'Verfassung' }] });
    if (path.endsWith('/settings')) return Response.json({ id: settings, outline: { kinds: [] } });
    return Response.json({});
  };
  try {
    const result = await callTool('get_import_setup', { jurisdictionId, constitutionSlug: '1850' }, 'Bearer ca_mcp_importer');
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent?.jurisdictionId, jurisdictionId);
    assert.equal(result.structuredContent?.constitutionId, constitutionId);
    assert.equal(result.structuredContent?.countryCode, undefined);
    assert.equal((await callTool('find_constitution', { jurisdictionId, countryCode: 'DE', constitutionSlug: '1850' }, 'Bearer ca_mcp_importer')).isError, true);
    assert.equal(calls.some(path => path.startsWith('/countries')), false);
    const exportResult = await callTool('export_import_job', { jobId: randomUUID(), view: 'submitted' }, 'Bearer ca_mcp_importer');
    assert.equal(exportResult.isError, true); // Malformed upstream export cannot pass the declared output contract.
  } finally { globalThis.fetch = originalFetch; }
});

test('MCP requests require a valid personal key with read scope', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls += 1;
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer ca_mcp_reader');
    return Response.json({ scopes: ['mcp:read'] });
  };
  try {
    await assert.rejects(authenticateMcpKey(), (error) => error instanceof UpstreamError && error.status === 401);
    await assert.rejects(authenticateMcpKey('Bearer ordinary-session'), (error) => error instanceof UpstreamError && error.status === 401);
    assert.equal(calls, 0);
    await authenticateMcpKey('Bearer ca_mcp_reader');
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('MCP requests reject a valid key without read scope', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ scopes: ['ingestion:import'] });
  try {
    await assert.rejects(authenticateMcpKey('Bearer ca_mcp_importer'), (error) => error instanceof UpstreamError && error.status === 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OAuth tokens must be issued for this MCP resource', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ scopes: ['mcp:read'], resource: 'https://another.example/mcp' });
  try {
    await assert.rejects(authenticateMcpKey('Bearer ca_oauth_issued'), (error) => error instanceof UpstreamError && error.status === 401);
    globalThis.fetch = async () => Response.json({ scopes: ['mcp:read'], resource: 'http://localhost/mcp' });
    await authenticateMcpKey('Bearer ca_oauth_issued');
  } finally { globalThis.fetch = originalFetch; }
});

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

test('known published snapshot permalinks survive later editorial corrections', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ id: 'staff', publicationStatus: 'published', listing: 'staff', currentVersionId: 'newer-tip' });
  try {
    assert.equal((await requirePublishedVersion('staff')).id, 'staff');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('direct reads accept the published editorial tip shown in public version listings', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ id: 'tip', publicationStatus: 'published', listing: 'staff', currentVersionId: 'tip' });
  try {
    assert.equal((await requirePublishedVersion('tip')).id, 'tip');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

async function callTool(name: string, args: Record<string, unknown>, authorization?: string): Promise<{ isError?: boolean; structuredContent?: Record<string, unknown>; content?: Array<{ text?: string }> }> {
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
  const body = await response.json() as { result: { isError?: boolean; structuredContent?: Record<string, unknown>; content?: Array<{ text?: string }> } };
  return body.result;
}

test('tool discovery describes read and staged-write retry behavior', async () => {
  const handler = createMcpHandler(() => createServer());
  const response = await handler.fetch(new Request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': 'tools/list',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientCapabilities': {},
    } } }),
  }));
  assert.equal(response.status, 200);
  const body = await response.json() as { result: { ttlMs?: number; cacheScope?: string; tools: Array<{ name: string; outputSchema?: { properties?: Record<string, unknown> }; annotations: { readOnlyHint: boolean; idempotentHint: boolean; destructiveHint: boolean } }> } };
  assert.equal(body.result.ttlMs, 60_000);
  assert.equal(body.result.cacheScope, 'private');
  const byName = new Map(body.result.tools.map(tool => [tool.name, tool.annotations]));
  assert.equal(byName.get('list_countries')?.readOnlyHint, true);
  assert.equal(byName.get('stage_batch_item')?.idempotentHint, true);
  assert.equal(byName.get('create_import_batch')?.idempotentHint, false);
  assert.equal(byName.get('stage_constitution_import')?.readOnlyHint, false);
  assert.equal(byName.get('cancel_import_upload')?.destructiveHint, true);
  assert.ok(body.result.tools.find(tool => tool.name === 'list_countries')?.outputSchema?.properties?.countries);
  assert.ok(body.result.tools.find(tool => tool.name === 'search_constitutions')?.outputSchema?.properties?.results);
});

test('import tool returns an HTTP OAuth scope challenge before invocation', async () => {
  const handler = createMcpHandler(() => createServer('Bearer ca_oauth_reader'));
  const response = await handler.fetch(new Request('http://localhost/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': 'get_import_setup' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_import_setup', arguments: { countryCode: 'FR', constitutionSlug: 'constitution' }, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} } } }),
  }), { authInfo: { token: 'ca_oauth_reader', clientId: 'reader', scopes: ['mcp:read'], resource: new URL('http://localhost/mcp'), resourceMetadataUrl: 'http://localhost/.well-known/oauth-protected-resource/mcp' } });
  assert.equal(response.status, 403);
  assert.match(response.headers.get('WWW-Authenticate') ?? '', /insufficient_scope/);
  assert.match(response.headers.get('WWW-Authenticate') ?? '', /ingestion:import/);
});

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

test('country cursor traverses in stable order and detects a changed collection', async () => {
  const originalFetch = globalThis.fetch;
  const countries = [
    { isoCode: 'FR', name: 'France', versionCount: 1 },
    { isoCode: 'DE', name: 'Germany', versionCount: 1 },
    { isoCode: 'AT', name: 'Austria', versionCount: 1 },
  ];
  globalThis.fetch = async () => Response.json(countries);
  try {
    const first = (await callTool('list_countries', { limit: 2 })).structuredContent!;
    assert.deepEqual((first.countries as CountryLike[]).map(country => country.isoCode), ['AT', 'DE']);
    const cursor = first.nextCursor as string;
    assert.ok(cursor);
    const second = (await callTool('list_countries', { limit: 2, cursor })).structuredContent!;
    assert.deepEqual((second.countries as CountryLike[]).map(country => country.isoCode), ['FR']);
    countries.push({ isoCode: 'CH', name: 'Switzerland', versionCount: 1 });
    const stale = await callTool('list_countries', { limit: 2, cursor });
    assert.equal(stale.isError, true);
    assert.equal(stale.structuredContent?.code, 'invalid_cursor');
    assert.equal(stale.structuredContent?.retryable, false);
  } finally { globalThis.fetch = originalFetch; }
});

type CountryLike = { isoCode: string };

test('MCP search hits include public article citation links', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ hits: [{ articleId: '01900000-0000-4000-8000-000000000001', versionId: '01900000-0000-4000-8000-000000000002', countryCode: 'FR', snippet: 'Text' }], total: 1, limit: 20, offset: 0, indexGeneration: 1 });
  try {
    const result = await callTool('search_constitutions', { query: 'Text' });
    const results = result.structuredContent?.results as { hits: Array<{ url: string }> };
    assert.match(results.hits[0].url, /\/countries\/FR\/versions\/01900000-0000-4000-8000-000000000002\/articles\/01900000-0000-4000-8000-000000000001$/);
  } finally { globalThis.fetch = originalFetch; }
});

test('search cursor traverses one index generation and rejects a reindex', async () => {
  const originalFetch = globalThis.fetch;
  let generation = 3;
  const id = (n: number) => `01900000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const hits = [0, 1, 2].slice(offset, offset + limit).map(n => ({ articleId: id(n + 1), versionId: id(9), countryCode: 'FR' }));
    return Response.json({ hits, total: 3, limit, offset, indexGeneration: generation });
  };
  try {
    const first = await callTool('search_constitutions', { query: 'Text', limit: 2 });
    const firstResults = first.structuredContent?.results as { hits: unknown[]; nextCursor: string; nextOffset: number };
    assert.equal(firstResults.hits.length, 2);
    assert.equal(firstResults.nextOffset, 2);
    const second = await callTool('search_constitutions', { query: 'Text', limit: 2, cursor: firstResults.nextCursor });
    assert.equal((second.structuredContent?.results as { hits: unknown[] }).hits.length, 1);
    generation += 1;
    const stale = await callTool('search_constitutions', { query: 'Text', limit: 2, cursor: firstResults.nextCursor });
    assert.equal(stale.structuredContent?.code, 'invalid_cursor');
    const wrongQuery = await callTool('search_constitutions', { query: 'Other', limit: 2, cursor: firstResults.nextCursor });
    assert.equal(wrongQuery.structuredContent?.code, 'invalid_cursor');
  } finally { globalThis.fetch = originalFetch; }
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

test('MCP rejects malformed import payload before calling upstream services', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ scopes: ['mcp:read', 'ingestion:import'] }); };
  try {
    const result = await callTool('stage_constitution_import', { payload: { isoCode: 'FR', countryName: 'France', constitutionSlug: '1958', constitutionTitle: 'Constitution', versionLabel: '1', articles: [{ articleNumber: '1', title: 'First', sortOrder: -1 }] } }, 'Bearer ca_mcp_editor');
    assert.equal(result.isError, true);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('MCP directs oversized valid payloads to chunked upload', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async input => { calls.push(new URL(String(input)).pathname); return Response.json({ scopes: ['mcp:read', 'ingestion:import'] }); };
  try {
    const payload = {
      isoCode: 'FR', countryName: 'France', constitutionSlug: '1958', constitutionTitle: 'Constitution', versionLabel: '1',
      constitutionId: '01900000-0000-4000-8000-000000000002', settingsRevisionId: '01900000-0000-4000-8000-000000000003',
      articles: [1, 2, 3].map(number => ({ articleNumber: String(number), title: 'Article', body: 'x'.repeat(800_000), sortOrder: number })),
    };
    const result = await callTool('stage_constitution_import', { payload }, 'Bearer ca_mcp_editor');
    assert.equal(result.isError, true);
    assert.match(result.content?.[0]?.text ?? '', /chunked/);
    assert.deepEqual(calls, ['/me']);
  } finally { globalThis.fetch = originalFetch; }
});

test('MCP import key stages a pending job and never publishes', async () => {
  const originalFetch = globalThis.fetch;
  const originalInfo = console.info;
  const audit: string[] = [];
  console.info = value => { audit.push(String(value)); };
  const calls: Array<{ url: string; method: string; idempotencyKey?: string }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET', idempotencyKey: new Headers(init?.headers).get('Idempotency-Key') ?? undefined });
    if (String(input).endsWith('/me')) return Response.json({ id: '01900000-0000-4000-8000-000000000099', scopes: ['mcp:read', 'ingestion:import'] });
    return Response.json({ id: '01900000-0000-4000-8000-000000000001', status: 'pending_review', errors: [] });
  };
  try {
    const payload = { isoCode: 'FR', countryName: 'France', constitutionSlug: '1958', constitutionTitle: 'Constitution', versionLabel: '1', constitutionId: '01900000-0000-4000-8000-000000000002', settingsRevisionId: '01900000-0000-4000-8000-000000000003' };
    const result = await callTool('stage_constitution_import', { payload }, 'Bearer ca_mcp_editor');
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent?.status, 'pending_review');
    assert.deepEqual(calls.map(call => call.method), ['GET', 'POST']);
    assert.match(calls[1].idempotencyKey ?? '', /^ca-mcp-[a-f0-9]{64}$/);
    await callTool('stage_constitution_import', { payload }, 'Bearer ca_mcp_editor');
    assert.equal(calls[3].idempotencyKey, calls[1].idempotencyKey);
    assert.equal(calls.some(call => call.url.includes('/publish')), false);
    assert.equal(JSON.parse(audit.at(-1) ?? '{}').actorId, '01900000-0000-4000-8000-000000000099');
    assert.equal(JSON.parse(audit.at(-1) ?? '{}').resourceId, '01900000-0000-4000-8000-000000000001');
    assert.equal(audit.some(line => line.includes('ca_mcp_editor')), false);
  } finally {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
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
    const result = await callTool('stage_constitution_import', { payload: { isoCode: 'FR', countryName: 'France', constitutionSlug: '1958', constitutionTitle: 'Constitution', versionLabel: '1', outline: { kinds: [{ kindCode: 'article', displayLabel: 'Article' }] } } }, 'Bearer ca_mcp_editor');
    assert.equal(result.isError, true);
    assert.deepEqual(calls.map(url => new URL(url).pathname), ['/me']);
  } finally { globalThis.fetch = originalFetch; }
});

test('MCP importer can cancel an unfinished upload without publishing', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ path: string; method: string }> = [];
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    calls.push({ path, method: init?.method ?? 'GET' });
    if (path === '/me') return Response.json({ id: '01900000-0000-4000-8000-000000000099', scopes: ['mcp:read', 'ingestion:import'] });
    return Response.json({ id: '01900000-0000-4000-8000-000000000001', batchId: '01900000-0000-4000-8000-000000000002', status: 'canceled', totalBytes: 100, chunkBytes: 524288, missingChunks: [], itemId: null });
  };
  try {
    const result = await callTool('cancel_import_upload', { uploadId: '01900000-0000-4000-8000-000000000001' }, 'Bearer ca_mcp_editor');
    assert.equal(result.structuredContent?.status, 'canceled');
    assert.deepEqual(calls.map(call => call.method), ['GET', 'DELETE']);
    assert.equal(calls.some(call => call.path.includes('publish')), false);
  } finally { globalThis.fetch = originalFetch; }
});
