import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { adminHeaders, createIsolatedConstitution } from './api-fixtures';

async function tool(request: APIRequestContext, name: string, args: Record<string, unknown>, key?: string) {
  const response = await request.post('/mcp', {
    headers: {
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': 'tools/call',
      'Mcp-Name': name,
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    data: {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name, arguments: args, _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientCapabilities': {},
      } },
    },
  });
  expect(response.ok(), `MCP ${name}: HTTP ${response.status()}`).toBeTruthy();
  return (await response.json()).result as { isError?: boolean; structuredContent?: Record<string, unknown> };
}

test('a personal MCP key discovers the pinned layout and stages only a pending review', async ({ request }) => {
  test.setTimeout(180_000);
  const fixture = await createIsolatedConstitution(request, `MCP journey ${randomUUID()}`);
  const admin = await adminHeaders(request);
  const keyResponse = await request.post('/api/identity/mcp-keys', {
    headers: admin,
    data: { name: `MCP journey ${randomUUID()}`, scopes: ['mcp:read', 'ingestion:import'] },
  });
  expect(keyResponse.status()).toBe(201);
  const created = await keyResponse.json() as { token: string; key: { id: string } };
  try {
    const country = await (await request.get('/api/catalog/countries/XA')).json();
    const constitution = country.constitutions.find((item: { id: string }) => item.id === fixture.constitutionId);
    expect(constitution).toBeTruthy();
    const setup = await tool(request, 'get_import_setup', { countryCode: 'XA', constitutionSlug: constitution.slug }, created.token);
    expect(setup.isError).toBeUndefined();
    expect(setup.structuredContent?.constitutionId).toBe(fixture.constitutionId);
    expect(setup.structuredContent?.settingsRevisionId).toBeTruthy();

    const staged = await tool(request, 'stage_constitution_import', { payload: {
      isoCode: 'XA', countryName: 'Atlas Testland', constitutionSlug: constitution.slug,
      constitutionTitle: constitution.title, constitutionId: fixture.constitutionId,
      settingsRevisionId: setup.structuredContent?.settingsRevisionId,
      versionLabel: `MCP ${randomUUID()}`, predecessorVersionId: fixture.targetVersionId,
      hopKind: 'legal', sourceUrl: 'https://example.org/atlas-e2e/mcp',
      articles: [{ articleNumber: '1', title: 'Human dignity', body: 'A reviewed import is required.', sortOrder: 1 }],
    } }, created.token);
    expect(staged.isError).toBeUndefined();
    expect(staged.structuredContent?.status).toBe('pending_review');
    const jobId = staged.structuredContent?.jobId as string;
    expect(jobId).toBeTruthy();
    expect((await request.post(`/api/ingestion/import-jobs/${jobId}/prepare`, { headers: { Authorization: `Bearer ${created.token}` } })).status()).toBe(403);
    expect((await request.post(`/api/ingestion/import-jobs/${jobId}/publish`, { headers: { Authorization: `Bearer ${created.token}` } })).status()).toBe(403);
    const job = await (await request.get(`/api/ingestion/import-jobs/${jobId}`, { headers: admin })).json();
    expect(job.status).toBe('pending_review');
    expect(job.versionId).toBeNull();
  } finally {
    expect((await request.delete(`/api/identity/mcp-keys/${created.key.id}`, { headers: admin })).status()).toBe(204);
  }
});
