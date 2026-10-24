import { expect, test, type APIRequestContext } from '../fixtures/consent';
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

test('an admin reviews and publishes their MCP import in the editor journey', async ({ page, request }, testInfo) => {
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

    const versionLabel = `MCP ${randomUUID()}`;
    const staged = await tool(request, 'stage_constitution_import', { payload: {
      isoCode: 'XA', countryName: 'Atlas Testland', constitutionSlug: constitution.slug,
      constitutionTitle: constitution.title, constitutionId: fixture.constitutionId,
      settingsRevisionId: setup.structuredContent?.settingsRevisionId,
      versionLabel, predecessorVersionId: fixture.targetVersionId,
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
    const listed = async () => {
      const detail = await (await request.get('/api/catalog/countries/XA')).json();
      return detail.constitutions.find((item: { id: string }) => item.id === fixture.constitutionId).versions as Array<{ versionLabel: string }>;
    };
    expect((await listed()).some(version => version.versionLabel === versionLabel)).toBe(false);
    await page.context().addCookies([{ name: 'ca_session', value: admin.Authorization.slice('Bearer '.length), url: String(testInfo.project.use.baseURL), httpOnly: true, sameSite: 'Lax' }]);
    await page.goto('/editor?status=reviewing');
    await page.locator('.editor-session-list li').filter({ hasText: versionLabel }).getByRole('link', { name: 'Open review' }).click();
    await expect(page).toHaveURL(new RegExp(`/editor\\?importJobId=${jobId}`));
    await page.getByRole('button', { name: 'Prepare unpublished draft' }).click();
    await expect(page.getByRole('heading', { name: 'Prepared draft as readers will see it' })).toBeVisible();
    await expect(page.getByText('A reviewed import is required.', { exact: true }).first()).toBeVisible();
    await page.getByLabel('Review reason').first().fill('Verified my MCP source and structure before publication.');
    await page.getByRole('button', { name: 'Approve prepared draft' }).click();
    await expect(page.getByRole('button', { name: 'Publish approved version' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Publish approved version' })).toBeVisible();
    expect((await listed()).some(version => version.versionLabel === versionLabel)).toBe(false);
    await page.goto('/editor?status=approved');
    await page.locator('.editor-session-list li').filter({ hasText: versionLabel }).getByRole('link', { name: 'Open publish view' }).click();
    await page.getByRole('button', { name: 'Publish approved version' }).click();
    await expect(page.getByRole('link', { name: 'Open the published version' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('link', { name: 'Open the published version' })).toBeVisible();
    const completed = await (await request.get(`/api/ingestion/import-jobs/${jobId}`, { headers: admin })).json();
    expect(completed.approvedBy).toBe(completed.submittedBy);
    expect(completed.publishedBy).toBe(completed.submittedBy);
    await expect.poll(async () => (await listed()).some(version => version.versionLabel === versionLabel)).toBe(true);
  } finally {
    expect((await request.delete(`/api/identity/mcp-keys/${created.key.id}`, { headers: admin })).status()).toBe(204);
  }
});

test('MCP waits while an administrator requests and confirms an exact setup revision on the website', async ({ page, request }, testInfo) => {
  test.setTimeout(180_000);
  const admin = await adminHeaders(request);
  const keyResponse = await request.post('/api/identity/mcp-keys', { headers: admin, data: { name: `Setup handoff ${randomUUID()}`, scopes: ['mcp:read', 'ingestion:import'] } });
  expect(keyResponse.status()).toBe(201);
  const key = await keyResponse.json();
  try {
    const slug = `setup-handoff-${randomUUID()}`;
    const initial = { isoCode: 'XA', countryName: 'Atlas Testland', constitutionSlug: slug, constitutionTitle: 'Setup handoff charter', languageCode: 'de', sourceUrl: 'https://example.org/atlas-e2e/setup', outline: { kinds: [{ kindCode: 'article', displayLabel: 'Article', root: true, allowedChildKinds: [], showKind: true }] }, sampleRoots: [{ kind: 'article', label: '1', content: [{ type: 'text', text: 'Alle Menschen sind frei. Alle Menschen sind gleich.' }] }] };
    const proposed = await tool(request, 'propose_constitution_setup', { proposal: initial }, key.token);
    expect(proposed.isError).toBeUndefined();
    expect(proposed.structuredContent?.nextAction).toBe('wait_for_confirmation');
    const proposalId = proposed.structuredContent?.proposalId as string;
    const path = `/api/ingestion/import-setup-proposals/${proposalId}`;
    expect((await request.post(`${path}/confirm`, { headers: { Authorization: `Bearer ${key.token}`, 'If-Match': '1' } })).status()).toBe(403);
    await page.context().addCookies([{ name: 'ca_session', value: admin.Authorization.slice(7), url: String(testInfo.project.use.baseURL), httpOnly: true, sameSite: 'Lax' }]);
    await page.goto(`/admin/import/setup/${proposalId}`);
    await expect(page.getByRole('heading', { name: 'Your confirmation is required' })).toBeVisible();
    await page.getByText('Display settings', { exact: true }).click();
    await page.getByLabel('Displayed unit name', { exact: true }).fill('Art.');
    await page.getByRole('button', { name: 'Save display settings' }).click();
    await expect.poll(async () => (await (await request.get(path, { headers: admin })).json()).revision).toBe(2);
    await page.reload();
    await expect(page.locator('[data-preview-kind="article"]')).toContainText('Art. 1');
    await page.getByText('Request changes through your chat client', { exact: true }).click();
    await page.getByLabel('Requested changes', { exact: true }).fill('Add sentence units without changing the original German wording.');
    await page.getByRole('button', { name: 'Record requested changes' }).click();
    await expect(page.getByRole('heading', { name: 'Waiting for a revised proposal' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm structure and enable full upload' })).toBeDisabled();
    const feedback = (await tool(request, 'get_setup_proposal', { proposalId }, key.token)).structuredContent!;
    expect(feedback.nextAction).toBe('revise_proposal');
    expect(feedback.requestedChanges).toContain('sentence units');
    const roots = [{ kind: 'article', label: '1', content: ['Alle Menschen sind frei.', 'Alle Menschen sind gleich.'].map(text => ({ type: 'child', node: { kind: 'sentence', content: [{ type: 'text', text }] } })) }];
    const revision = { ...initial, outline: { kinds: [{ ...initial.outline.kinds[0], allowedChildKinds: ['sentence'] }, { kindCode: 'sentence', displayLabel: 'Sentence', root: false, allowedChildKinds: [], showKind: false, presentation: 'concatenated', showLabel: false }] }, sampleRoots: roots };
    const revised = await tool(request, 'revise_setup_proposal', { proposalId, expectedRevision: feedback.revision, proposal: revision }, key.token);
    expect(revised.isError).toBeUndefined();
    expect(revised.structuredContent?.nextAction).toBe('wait_for_confirmation');
    expect((await request.post(`${path}/confirm`, { headers: { ...admin, 'If-Match': String(feedback.revision) } })).status()).toBe(409);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Revised proposal ready for review' })).toBeVisible();
    await expect(page.getByText('Hierarchy or editing rules changed.')).toBeVisible();
    await expect(page.locator('[data-preview-kind="sentence"]')).toHaveCount(2);
    await expect(page.locator('[data-preview-kind="article"]')).toContainText('Art. 1');
    await page.getByText('Display settings', { exact: true }).click();
    await page.getByLabel('Displayed unit name', { exact: true }).first().fill('Artikel');
    await page.getByRole('button', { name: 'Confirm structure and enable full upload' }).click();
    await expect(page.getByRole('heading', { name: 'Structure confirmed – full upload enabled' })).toBeVisible();
    const confirmed = (await tool(request, 'get_setup_proposal', { proposalId }, key.token)).structuredContent!;
    expect(confirmed.nextAction).toBe('upload_full_content');
    expect((confirmed.payload as any).outline.kinds[0].displayLabel).toBe('Artikel');
    const staged = await tool(request, 'stage_constitution_import', { payload: { isoCode: 'XA', countryName: 'Atlas Testland', constitutionSlug: slug, constitutionTitle: initial.constitutionTitle, constitutionId: confirmed.constitutionId, settingsRevisionId: confirmed.settingsRevisionId, versionLabel: 'Setup review fixture', languageCode: 'de', sourceUrl: initial.sourceUrl, roots } }, key.token);
    expect(staged.isError).toBeUndefined();
    expect(staged.structuredContent?.status).toBe('pending_review');
  } finally { await request.delete(`/api/identity/mcp-keys/${key.key.id}`, { headers: admin }); }
});
