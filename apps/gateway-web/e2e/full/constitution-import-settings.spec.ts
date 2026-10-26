import { expect, test, type APIRequestContext } from '../fixtures/consent';
import type { Locator, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { adminHeaders, roleHeaders } from './api-fixtures';
import { startFromViewer } from './auth';

async function json(response: Awaited<ReturnType<APIRequestContext['post']>>) {
  const body = await response.json();
  expect(response.ok(), `${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
  return body;
}

async function mcp(request: APIRequestContext, token: string, name: string, args: Record<string, unknown>) {
  const body = await json(await request.post('/mcp', {
    headers: {
      Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}`,
      'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': name,
    },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args, _meta: {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {},
    } } },
  }));
  expect(body.error ?? body.result?.isError, JSON.stringify(body)).toBeFalsy();
  return body.result.structuredContent;
}

const layer = (page: Page, index: number) => page.locator('.outline-layer-list > li').nth(index);
const select = (scope: Locator, name: string) => scope.locator(`select[name^="${name}-"]`);

async function saveSettings(page: Page) {
  const revision = page.locator('input[name="settingsRevisionId"]').first();
  const previousRevision = await revision.inputValue();
  const save = page.getByRole('button', { name: 'Save outline', exact: true });
  await expect(save).toBeDisabled();
  await page.getByRole('button', { name: 'Preview change impact', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Safe to save', exact: true })).toBeVisible();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page).toHaveURL(/\?saved=1$/);
  await expect(revision).not.toHaveValue(previousRevision);
  await page.reload();
}

test('constitution configuration governs MCP imports, review previews and the published reader', async ({ page, request, browser }, testInfo) => {
  test.setTimeout(300_000);
  const admin = await adminHeaders(request);
  const key = await json(await request.post('/api/identity/mcp-keys', { headers: admin, data: {
    name: `Configuration import ${randomUUID()}`, scopes: ['mcp:read', 'ingestion:import'],
  } }));
  const slug = `configuration-${randomUUID()}`;
  const title = `Configuration import ${randomUUID()}`;
  const sourceUrl = 'https://example.org/atlas-e2e/configuration';
  const initialRoots = [{ kind: 'article', label: 'I', title: 'Initial sample', content: [{ type: 'text', text: 'Initial sample text.' }] }];
  try {
    const proposed = await mcp(request, key.token, 'propose_constitution_setup', { proposal: {
      isoCode: 'XA', countryName: 'Atlas Testland', constitutionSlug: slug, constitutionTitle: title,
      languageCode: 'en', sourceUrl, sampleRoots: initialRoots,
      outline: { kinds: [
        { kindCode: 'article', displayLabel: 'Article', root: true, allowedChildKinds: [], showKind: true },
        { kindCode: 'paragraph', displayLabel: 'Paragraph', root: true, allowedChildKinds: [], showKind: false },
      ] },
    } });
    const confirmed = await json(await request.post(`/api/ingestion/import-setup-proposals/${proposed.proposalId}/confirm`, {
      headers: { ...admin, 'If-Match': String(proposed.revision) },
    }));
    const configurationUrl = `/admin/constitutions/${confirmed.constitutionId}`;
    await page.context().addCookies([{ name: 'ca_session', value: admin.Authorization.slice(7),
      url: String(testInfo.project.use.baseURL), httpOnly: true, sameSite: 'Lax' }]);
    await page.goto(configurationUrl);

    // The two initially independent root kinds become a parent/child structure.
    const article = layer(page, 0);
    const paragraph = layer(page, 1);
    await article.locator('input[name="label-0"]').fill('Provision');
    await article.getByRole('checkbox', { name: 'Paragraph', exact: true }).check();
    await article.getByRole('checkbox', { name: 'Allow text alongside child units', exact: true }).check();
    await paragraph.getByRole('checkbox', { name: 'May appear at the top level', exact: true }).uncheck();
    await select(article, 'title-policy').selectOption('required');
    await select(article, 'label-policy').selectOption('required');
    await select(article, 'label-placement').selectOption('after_title');
    await select(paragraph, 'title-policy').selectOption('none');
    await select(paragraph, 'label-policy').selectOption('required');
    await select(paragraph, 'segmentation').selectOption('sentence');
    await select(paragraph, 'presentation').selectOption('concatenated');
    await select(paragraph, 'label-placement').selectOption('superscript');
    await paragraph.getByRole('checkbox', { name: 'Show literal legal label', exact: true }).check();
    await expect(paragraph.getByRole('checkbox', { name: /^Show kind name/ })).toBeDisabled();
    await expect(paragraph.getByRole('checkbox', { name: 'Show editorial title', exact: true })).toBeDisabled();

    // Add a genuinely independent root with no authorable title or literal label.
    await page.getByRole('button', { name: 'Add top-level kind', exact: true }).click();
    const preamble = layer(page, 2);
    await preamble.locator('input[name="label-2"]').fill('Preamble');
    await select(preamble, 'title-policy').selectOption('none');
    await select(preamble, 'label-policy').selectOption('none');
    await expect(preamble.getByRole('checkbox', { name: 'Show editorial title', exact: true })).toBeDisabled();
    await expect(preamble.getByRole('checkbox', { name: 'Show literal legal label', exact: true })).toBeDisabled();
    await expect(select(preamble, 'label-placement')).toBeDisabled();
    await saveSettings(page);
    await expect(article.locator('input[name="label-0"]')).toHaveValue('Provision');
    await expect(article.getByRole('checkbox', { name: 'Paragraph', exact: true })).toBeChecked();
    await expect(article.getByRole('checkbox', { name: 'Allow text alongside child units', exact: true })).toBeChecked();
    await expect(paragraph.getByRole('checkbox', { name: 'May appear at the top level', exact: true })).not.toBeChecked();
    await expect(select(article, 'title-policy')).toHaveValue('required');
    await expect(select(article, 'label-policy')).toHaveValue('required');
    await expect(select(article, 'label-placement')).toHaveValue('after_title');
    await expect(select(paragraph, 'segmentation')).toHaveValue('sentence');
    await expect(select(paragraph, 'presentation')).toHaveValue('concatenated');
    await expect(select(paragraph, 'label-placement')).toHaveValue('superscript');
    await expect(select(paragraph, 'label-placement').locator('option[value="inline"]')).toBeEnabled();
    await expect(select(paragraph, 'label-placement').locator('option[value="superscript"]')).toBeEnabled();
    await expect(select(preamble, 'title-policy')).toHaveValue('none');
    await expect(select(preamble, 'label-policy')).toHaveValue('none');
    const settings = await json(await request.get(`/api/catalog/constitutions/${confirmed.constitutionId}/settings`, { headers: admin }));
    const setup = await mcp(request, key.token, 'get_import_setup', { countryCode: 'XA', constitutionSlug: slug });
    expect(setup.settingsRevisionId).toBe(settings.id);
    expect(settings.id).not.toBe(confirmed.settingsRevisionId);
    expect(settings.outline.kinds).toEqual(expect.arrayContaining([
      expect.objectContaining({ kindCode: 'article', displayLabel: 'Provision', root: true, allowedChildKinds: ['paragraph'], allowTextAlongsideChildren: true, titlePolicy: 'required', labelPolicy: 'required', labelPlacement: 'after_title' }),
      expect.objectContaining({ kindCode: 'paragraph', root: false, titlePolicy: 'none', labelPolicy: 'required', segmentation: 'sentence', presentation: 'concatenated', labelPlacement: 'superscript' }),
      expect.objectContaining({ kindCode: 'preamble', root: true, titlePolicy: 'none', labelPolicy: 'none' }),
    ]));

    const firstParagraph = { kind: 'paragraph', label: '(a)', content: [{ type: 'text', text: 'Every person is free.' }] };
    const secondParagraph = { kind: 'paragraph', label: '(b)', content: [{ type: 'text', text: 'Every person is equal.' }] };
    const roots = [
      { kind: 'preamble', content: [{ type: 'text', text: 'This charter preserves every source word.' }] },
      { kind: 'article', label: 'I', title: 'Protected rights', content: [
        { type: 'text', text: 'The following rights are guaranteed.' },
        { type: 'child', node: firstParagraph },
        { type: 'child', node: secondParagraph },
      ] },
    ];
    const payload = { isoCode: 'XA', countryName: 'Atlas Testland', constitutionSlug: slug, constitutionTitle: title,
      constitutionId: confirmed.constitutionId, settingsRevisionId: settings.id, versionLabel: 'Configuration verification', languageCode: 'en', sourceUrl, roots };
    const stage = (changes: Record<string, unknown>) => mcp(request, key.token, 'stage_constitution_import', { payload: { ...payload, ...changes } });

    // A previously discovered revision cannot be prepared after settings change.
    const stale = await stage({ settingsRevisionId: confirmed.settingsRevisionId, roots: initialRoots, versionLabel: 'Stale settings' });
    expect(stale.status).toBe('pending_review');
    const stalePreparation = await request.post(`/api/ingestion/import-jobs/${stale.jobId}/prepare`, { headers: admin });
    expect(stalePreparation.status()).toBe(409);
    expect(await stalePreparation.text()).toContain('Settings revision changed');

    const invalidRoot = await stage({ roots: [firstParagraph], versionLabel: 'Invalid root' });
    expect(invalidRoot.status).toBe('failed');
    expect(invalidRoot.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ROOT_KIND' })]));
    const invalidChild = await stage({ roots: [{ ...roots[1], content: [{ type: 'child', node: roots[0] }] }], versionLabel: 'Invalid child' });
    expect(invalidChild.status).toBe('failed');
    expect(invalidChild.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'HIERARCHY_KIND' })]));

    // Authoring policies are enforced when Content prepares the stored draft.
    for (const [versionLabel, invalidArticle] of [
      ['Required title', { ...roots[1], title: null }],
      ['Required label', { ...roots[1], label: null }],
      ['Forbidden child title', { ...roots[1], content: [{ type: 'child', node: { ...firstParagraph, title: 'Not permitted' } }] }],
    ] as const) {
      const invalid = await stage({ roots: [invalidArticle], versionLabel });
      expect(invalid.status).toBe('pending_review');
      const rejected = await json(await request.post(`/api/ingestion/import-jobs/${invalid.jobId}/prepare`, { headers: admin }));
      expect(rejected.status).toBe('failed');
      expect(rejected.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PREPARATION_FAILED' })]));
      expect((await request.post(`/api/ingestion/import-jobs/${invalid.jobId}/approve`, { headers: admin, data: { reason: 'Invalid settings must block approval.' } })).status()).toBe(409);
    }

    const staged = await stage({});
    expect(staged.status).toBe('pending_review');
    expect(staged.errors).toEqual([]);
    await page.goto(`/admin/import/${staged.jobId}`);
    await page.getByRole('button', { name: 'Prepare unpublished draft', exact: true }).click();
    const preview = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Prepared draft as readers will see it', exact: true }) });
    await expect(preview.locator('.node-kind-article > .node-heading')).toHaveText('Provision Protected rights I');
    await expect(preview.locator('.constitution-concat')).toHaveText('(a)Every person is free. (b)Every person is equal.');
    await expect(preview.locator('.constitution-concat sup.num')).toHaveText(['(a)', '(b)']);
    const prepared = await json(await request.get(`/api/ingestion/import-jobs/${staged.jobId}`, { headers: admin }));
    const contentBefore = await json(await request.get(`/api/content/versions/${prepared.versionId}/content`, { headers: admin }));
    expect(contentBefore.settingsRevisionId).toBe(settings.id);
    expect((await request.get(`/api/content/versions/${prepared.versionId}/content`)).status()).toBe(404);

    // Display-only changes after preparation must reach the review preview too.
    await page.goto(configurationUrl);
    await article.locator('input[name="label-0"]').fill('Clause');
    await article.getByRole('checkbox', { name: /^Show kind name/ }).uncheck();
    await article.getByRole('checkbox', { name: 'Show editorial title', exact: true }).uncheck();
    await select(article, 'label-placement').selectOption('inline');
    await paragraph.getByRole('checkbox', { name: 'Show literal legal label', exact: true }).uncheck();
    await saveSettings(page);
    await expect(article.locator('input[name="label-0"]')).toHaveValue('Clause');
    await expect(article.getByRole('checkbox', { name: /^Show kind name/ })).not.toBeChecked();
    await expect(article.getByRole('checkbox', { name: 'Show editorial title', exact: true })).not.toBeChecked();
    await expect(select(article, 'label-placement')).toHaveValue('inline');
    await expect(paragraph.getByRole('checkbox', { name: 'Show literal legal label', exact: true })).not.toBeChecked();
    await page.goto(`/admin/import/${staged.jobId}`);
    await expect(preview.locator('.node-kind-article > .node-heading')).toHaveCount(0);
    await expect(preview.locator('.node-kind-article > span.num')).toHaveText('I');
    await expect(preview.locator('.constitution-concat')).toHaveText('Every person is free. Every person is equal.');
    await expect(preview.locator('.constitution-concat sup.num')).toHaveCount(0);

    const reviewer = await roleHeaders(request, 'reviewer');
    const publisher = await roleHeaders(request, 'publisher');
    await json(await request.post(`/api/ingestion/import-jobs/${staged.jobId}/approve`, { headers: reviewer, data: { reason: 'Verified source, settings, hidden headings and exact prepared text.' } }));
    const published = await json(await request.post(`/api/ingestion/import-jobs/${staged.jobId}/publish`, { headers: publisher }));
    expect(published.status).toBe('completed');
    expect(published.approvedBy).not.toBe(published.submittedBy);
    expect(published.publishedBy).not.toBe(published.approvedBy);
    expect(await json(await request.get(`/api/content/versions/${prepared.versionId}/content`))).toEqual(contentBefore);

    const readerContext = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL) });
    try {
      const reader = await readerContext.newPage();
      const publicUrl = `/countries/XA/versions/${prepared.versionId}`;
      await reader.goto(publicUrl);
      await reader.reload();
      await reader.getByRole('group', { name: 'Detail level', exact: true }).getByRole('button').last().click();
      await expect(reader.locator('.constitution-concat')).toHaveText('Every person is free. Every person is equal.');
      await expect(reader.locator('.constitution-concat sup.num')).toHaveCount(0);
      await expect(reader.getByText('The following rights are guaranteed.', { exact: true })).toBeVisible();

      // Incompatible structure changes are blocked by impact checking.
      await page.goto(configurationUrl);
      await article.getByRole('checkbox', { name: 'Allow text alongside child units', exact: true }).uncheck();
      await page.getByRole('button', { name: 'Preview change impact', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Reviewed migration required', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save outline', exact: true })).toBeDisabled();
      await page.reload();
      await expect(article.getByRole('checkbox', { name: 'Allow text alongside child units', exact: true })).toBeChecked();

      await preamble.getByRole('button', { name: 'Remove level', exact: true }).click();
      await page.getByRole('button', { name: 'Preview change impact', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Reviewed migration required', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save outline', exact: true })).toBeDisabled();
      await page.reload();
      await expect(preamble.locator('input[name="label-2"]')).toHaveValue('Preamble');

      await page.getByRole('button', { name: 'Restore previous settings', exact: true }).click();
      await expect(page).toHaveURL(/\?saved=1$/);
      await page.reload();
      await expect(article.locator('input[name="label-0"]')).toHaveValue('Provision');
      await expect(article.getByRole('checkbox', { name: /^Show kind name/ })).toBeChecked();
      await expect(article.getByRole('checkbox', { name: 'Show editorial title', exact: true })).toBeChecked();
      await expect(select(article, 'label-placement')).toHaveValue('after_title');
      await expect(paragraph.getByRole('checkbox', { name: 'Show literal legal label', exact: true })).toBeChecked();
      await reader.reload();
      await reader.getByRole('group', { name: 'Detail level', exact: true }).getByRole('button').last().click();
      await expect(reader.locator('.constitution-concat sup.num')).toHaveText(['(a)', '(b)']);
      await expect(reader.getByText('Provision Protected rights I', { exact: true }).first()).toBeVisible();
      expect(await json(await request.get(`/api/content/versions/${prepared.versionId}/content`))).toEqual(contentBefore);
      await startFromViewer(page, 'XA', prepared.versionId, 'editorial_correction');
      const draft = page.locator('#draft-form');
      await page.getByLabel('Editor view', { exact: true }).selectOption('constitution');
      await draft.getByRole('button', { name: 'Provision I Protected rights', exact: true }).click();
      await expect(draft.getByRole('button', { name: 'Suggest sentence boundaries', exact: true })).toHaveCount(2);
      await draft.getByLabel('Paragraph text', { exact: true }).first().fill('Every person is free. Rights are protected.');
      await draft.getByRole('button', { name: 'Suggest sentence boundaries', exact: true }).first().click();
      await expect(draft.getByLabel('Paragraph text', { exact: true })).toHaveCount(3);
      await draft.getByRole('button', { name: 'Save draft', exact: true }).click();
      await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
      await page.reload();
      await expect(draft.getByLabel('Paragraph text', { exact: true })).toHaveCount(3);
      await expect(draft.getByLabel('Paragraph text', { exact: true }).nth(1)).toHaveValue('Rights are protected.');
      expect(await json(await request.get(`/api/content/versions/${prepared.versionId}/content`))).toEqual(contentBefore);
    } finally { await readerContext.close(); }
  } finally {
    expect((await request.delete(`/api/identity/mcp-keys/${key.key.id}`, { headers: admin })).status()).toBe(204);
  }
});
