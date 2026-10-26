import { expect, test, type APIRequestContext } from '../fixtures/consent';
import { randomUUID } from 'node:crypto';
import { adminHeaders, roleHeaders, createIsolatedConstitution } from './api-fixtures';

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

test('MCP setup display controls persist and render the same source through review and publication', async ({ page, request, browser }, testInfo) => {
  test.setTimeout(240_000);
  const admin = await adminHeaders(request);
  const keyResponse = await request.post('/api/identity/mcp-keys', { headers: admin, data: {
    name: `Display settings ${randomUUID()}`, scopes: ['mcp:read', 'ingestion:import'],
  } });
  expect(keyResponse.status()).toBe(201);
  const key = await keyResponse.json();
  const slug = `display-settings-${randomUUID()}`;
  const roots = [{ kind: 'article', label: 'I', title: 'Rights', content: [
    { type: 'child', node: { kind: 'paragraph', label: '(1)', title: 'Freedom', content: [{ type: 'text', text: 'Alle Menschen sind frei.' }] } },
    { type: 'child', node: { kind: 'paragraph', label: '(2)', title: 'Equality', content: [{ type: 'text', text: 'Alle Menschen sind gleich.' }] } },
  ] }];
  const proposal = { isoCode: 'XA', countryName: 'Atlas Testland', constitutionSlug: slug,
    constitutionTitle: 'Display settings charter', languageCode: 'de', sourceUrl: 'https://example.org/atlas-e2e/display',
    outline: { kinds: [
      { kindCode: 'article', displayLabel: 'Article', root: true, allowedChildKinds: ['paragraph'], showKind: true, showLabel: true, showTitle: true, titlePolicy: 'optional', labelPolicy: 'optional' },
      { kindCode: 'paragraph', displayLabel: 'Paragraph', root: false, allowedChildKinds: [], showKind: true, showLabel: true, showTitle: true, titlePolicy: 'optional', labelPolicy: 'optional' },
    ] }, sampleRoots: roots };
  try {
    const proposed = await tool(request, 'propose_constitution_setup', { proposal }, key.token);
    expect(proposed.isError).toBeUndefined();
    const proposalId = proposed.structuredContent!.proposalId;
    const path = `/api/ingestion/import-setup-proposals/${proposalId}`;
    const readProposal = async () => {
      const response = await request.get(path, { headers: admin });
      expect(response.ok()).toBeTruthy();
      return response.json();
    };
    await page.context().addCookies([{ name: 'ca_session', value: admin.Authorization.slice(7), url: String(testInfo.project.use.baseURL), httpOnly: true, sameSite: 'Lax' }]);
    await page.goto(`/admin/import/setup/${proposalId}`);
    const controls = page.locator('fieldset').nth(1);
    const preview = page.locator('[data-preview-kind="paragraph"]:visible').first();
    const heading = preview.locator(':scope > .node-heading');
    const openSettings = () => page.getByText('Display settings', { exact: true }).click();
    const saveAndReload = async (expected: Record<string, unknown>) => {
      const before = await readProposal();
      await page.getByRole('button', { name: 'Save display settings' }).click();
      await expect.poll(async () => (await readProposal()).revision).toBe(before.revision + 1);
      // Wait for the form's full-page navigation before reloading persisted state.
      await expect(page.locator('input[name="revision"]')).toHaveValue(String(before.revision + 1));
      await page.reload();
      const saved = await readProposal();
      expect(saved.payload.outline.kinds[1]).toMatchObject(expected);
      expect(saved.payload.sampleRoots).toEqual(before.payload.sampleRoots);
      await openSettings();
    };

    await openSettings();
    await expect(heading).toHaveText('Paragraph (1) — Freedom');
    const parentPlacement = page.locator('fieldset').first().getByLabel('Label placement', { exact: true });
    await expect(parentPlacement.locator('option[value="inline"]')).toBeDisabled();
    await expect(parentPlacement.locator('option[value="superscript"]')).toBeDisabled();
    await controls.getByLabel('Displayed unit name', { exact: true }).fill('Absatz');
    await controls.getByLabel('Label placement', { exact: true }).selectOption('after_title');
    await expect(heading).toHaveText('Absatz Freedom (1)');
    await saveAndReload({ displayLabel: 'Absatz', labelPlacement: 'after_title' });
    await expect(controls.getByLabel('Displayed unit name', { exact: true })).toHaveValue('Absatz');
    await expect(heading).toHaveText('Absatz Freedom (1)');

    await controls.getByLabel('Show unit name', { exact: true }).uncheck();
    await expect(heading).toHaveText('Freedom (1)');
    await controls.getByLabel('Show title', { exact: true }).uncheck();
    await expect(heading).toHaveText('(1)');
    await expect(controls.getByLabel('Label placement', { exact: true }).locator('option[value="after_title"]')).toBeDisabled();
    await controls.getByLabel('Show source label', { exact: true }).uncheck();
    await expect(heading).toHaveCount(0);
    await expect(controls.getByLabel('Label placement', { exact: true })).toBeDisabled();
    await saveAndReload({ showKind: false, showTitle: false, showLabel: false });
    await expect(heading).toHaveCount(0);
    for (const label of ['Show unit name', 'Show title', 'Show source label']) {
      await expect(controls.getByLabel(label, { exact: true })).not.toBeChecked();
      await controls.getByLabel(label, { exact: true }).check();
    }
    await controls.getByLabel('Label placement', { exact: true }).selectOption('before_title');
    await saveAndReload({ showKind: true, showTitle: true, showLabel: true, labelPlacement: 'before_title' });
    await expect(heading).toHaveText('Absatz (1) — Freedom');
    await controls.getByLabel('Label placement', { exact: true }).selectOption('inline');
    await saveAndReload({ labelPlacement: 'inline' });
    await expect(heading).toHaveText('Absatz — Freedom');
    await expect(preview.locator(':scope > span.num')).toHaveText('(1)');
    await expect(preview.locator(':scope > sup.num')).toHaveCount(0);
    await controls.getByLabel('Label placement', { exact: true }).selectOption('superscript');
    await saveAndReload({ labelPlacement: 'superscript' });
    await expect(preview.locator(':scope > sup.num')).toHaveText('(1)');
    await expect(preview.locator(':scope > span.num')).toHaveCount(0);

    await controls.getByLabel('Layout', { exact: true }).selectOption('concatenated');
    await expect(controls.getByLabel('Show unit name', { exact: true })).toBeDisabled();
    await expect(controls.getByLabel('Show title', { exact: true })).toBeDisabled();
    await expect(controls.getByLabel('Label placement', { exact: true }).locator('option[value="before_title"]')).toBeDisabled();
    await saveAndReload({ presentation: 'concatenated', labelPlacement: 'superscript' });
    await expect(controls.getByLabel('Layout', { exact: true })).toHaveValue('concatenated');
    await expect(page.locator('.constitution-concat:visible')).toHaveCount(1);
    await expect(page.locator('.constitution-concat:visible sup.num')).toHaveText(['(1)', '(2)']);
    await expect(page.locator('.constitution-concat:visible')).toHaveText('(1)Alle Menschen sind frei. (2)Alle Menschen sind gleich.');
    await expect(page.locator('.constitution-concat:visible .node-heading')).toHaveCount(0);

    // Confirmation also persists edits made since the last explicit save.
    await page.locator('fieldset').first().getByLabel('Displayed unit name', { exact: true }).fill('Artikel');
    await page.getByRole('button', { name: 'Confirm structure and enable full upload' }).click();
    await expect(page.getByRole('heading', { name: 'Structure confirmed – full upload enabled' })).toBeVisible();
    const setup = await tool(request, 'get_import_setup', { countryCode: 'XA', constitutionSlug: slug }, key.token);
    expect(setup.isError).toBeUndefined();
    const settingsResponse = await request.get(`/api/catalog/constitutions/${setup.structuredContent!.constitutionId}/settings`, { headers: admin });
    expect(settingsResponse.ok()).toBeTruthy();
    const settings = await settingsResponse.json();
    expect(settings.id).toBe(setup.structuredContent!.settingsRevisionId);
    expect(settings.outline.kinds[0].displayLabel).toBe('Artikel');
    expect(settings.outline.kinds[1]).toMatchObject({ displayLabel: 'Absatz', presentation: 'concatenated', labelPlacement: 'superscript' });
    const staged = await tool(request, 'stage_constitution_import', { payload: {
      isoCode: proposal.isoCode, countryName: proposal.countryName, constitutionSlug: slug, constitutionTitle: proposal.constitutionTitle,
      constitutionId: setup.structuredContent!.constitutionId, settingsRevisionId: setup.structuredContent!.settingsRevisionId,
      versionLabel: 'Display controls verified', languageCode: 'de', sourceUrl: proposal.sourceUrl, roots,
    } }, key.token);
    expect(staged.isError).toBeUndefined();
    expect(staged.structuredContent!.status).toBe('pending_review');
    const jobId = staged.structuredContent!.jobId;
    await page.goto(`/editor?importJobId=${jobId}`);
    await page.getByRole('button', { name: 'Prepare unpublished draft' }).click();
    await expect(page.getByRole('heading', { name: 'Prepared draft as readers will see it' })).toBeVisible();
    const assertRendered = async (view: typeof page) => {
      await expect(view.locator('.constitution-concat:visible')).toHaveText('(1)Alle Menschen sind frei. (2)Alle Menschen sind gleich.');
      await expect(view.locator('.constitution-concat:visible sup.num')).toHaveText(['(1)', '(2)']);
      await expect(view.locator('.constitution-concat:visible .node-heading')).toHaveCount(0);
    };
    await assertRendered(page);
    await page.reload();
    await assertRendered(page);
    await expect(page.locator('.node-heading:visible').filter({ hasText: 'Artikel I — Rights' })).toHaveCount(1);
    const prepared = await (await request.get(`/api/ingestion/import-jobs/${jobId}`, { headers: admin })).json();
    const before = await (await request.get(`/api/content/versions/${prepared.versionId}/content`, { headers: admin })).json();
    expect(before.roots[0]).toMatchObject({ kind: 'article', label: 'I', title: 'Rights' });
    expect(before.roots[0].content.map((entry: any) => ({ label: entry.node.label, title: entry.node.title, text: entry.node.content[0].text }))).toEqual([
      { label: '(1)', title: 'Freedom', text: 'Alle Menschen sind frei.' }, { label: '(2)', title: 'Equality', text: 'Alle Menschen sind gleich.' },
    ]);
    expect((await request.get(`/api/content/versions/${prepared.versionId}/content`)).status()).toBe(404);
    for (const [role, action] of [['reviewer', 'approve'], ['publisher', 'publish']] as const) {
      const response = await request.post(`/api/ingestion/import-jobs/${jobId}/${action}`, { headers: await roleHeaders(request, role),
        ...(action === 'approve' ? { data: { reason: 'Verified persisted display settings, exact source wording and reader preview.' } } : {}) });
      expect(response.ok(), `${action}: ${await response.text()}`).toBeTruthy();
    }
    const anonymous = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL) });
    try {
      const reader = await anonymous.newPage();
      await reader.goto(`/countries/XA/versions/${prepared.versionId}/units/${before.roots[0].occurrenceId}`);
      await expect(reader.getByRole('heading', { name: 'Artikel · I · Rights', exact: true })).toBeVisible();
      await assertRendered(reader);
      await reader.reload();
      await assertRendered(reader);
      expect(await (await request.get(`/api/content/versions/${prepared.versionId}/content`)).json()).toEqual(before);
    } finally { await anonymous.close(); }
  } finally {
    expect((await request.delete(`/api/identity/mcp-keys/${key.key.id}`, { headers: admin })).status()).toBe(204);
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
    await expect(page.locator('[data-preview-kind="article"]:visible')).toContainText('Art. 1');
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
    await expect(page.locator('[data-preview-kind="article"]:visible')).toContainText('Art. 1');
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
