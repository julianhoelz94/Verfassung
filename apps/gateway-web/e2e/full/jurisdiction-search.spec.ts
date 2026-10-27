import { expect, test } from '../fixtures/consent';
import { randomUUID } from 'node:crypto';
import { adminHeaders, roleHeaders } from './api-fixtures';

test('a country jurisdiction without a legacy country record has a working indexed reader route', async ({ page, request }) => {
  const admin = await adminHeaders(request);
  const existing = await (await request.get('/api/catalog/jurisdictions')).json();
  const code = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ', letter => `Q${letter}`)
    .find(candidate => !existing.some((item: { code?: string }) => item.code === candidate));
  expect(code).toBeTruthy();
  const nonce = randomUUID();
  const keyword = `jurisdictionroute${nonce.replaceAll('-', '')}`;
  async function read(response: Awaited<ReturnType<typeof request.post>>) {
    const body = await response.json();
    expect(response.ok(), `${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
    return body;
  }
  const jurisdiction = await read(await request.post('/api/catalog/jurisdictions', { headers: admin, data: {
    name: 'Country with an independent historical slug', kind: 'country', code, slug: `independent-${nonce}`,
  } }));
  const roots = [{ kind: 'article', label: '1', content: [{ type: 'text', text: `Exact authored wording ${keyword}.` }] }];
  const proposal = await read(await request.post('/api/ingestion/import-setup-proposals', { headers: admin, data: {
    jurisdictionId: jurisdiction.id, constitutionSlug: 'charter', constitutionTitle: 'Independent country charter', languageCode: 'en', sourceUrl: 'https://example.org/source',
    outline: { kinds: [{ kindCode: 'article', displayLabel: 'Article', root: true, allowedChildKinds: [] }] }, sampleRoots: roots,
  } }));
  const setup = await read(await request.post(`/api/ingestion/import-setup-proposals/${proposal.id}/confirm`, { headers: { ...admin, 'If-Match': String(proposal.revision) } }));
  const job = await read(await request.post('/api/ingestion/import-jobs', { headers: admin, data: {
    jurisdictionId: jurisdiction.id, constitutionId: setup.constitutionId, settingsRevisionId: setup.settingsRevisionId,
    constitutionSlug: 'charter', constitutionTitle: 'Independent country charter', versionLabel: 'Original', languageCode: 'en', sourceUrl: 'https://example.org/source',
    roots,
  } }));
  await read(await request.post(`/api/ingestion/import-jobs/${job.id}/prepare`, { headers: admin }));
  await read(await request.post(`/api/ingestion/import-jobs/${job.id}/approve`, { headers: await roleHeaders(request, 'reviewer'), data: { reason: 'Compared the exact fixture source and its jurisdiction ownership.' } }));
  const published = await read(await request.post(`/api/ingestion/import-jobs/${job.id}/publish`, { headers: await roleHeaders(request, 'publisher') }));
  await read(await request.post('/api/search/reindex', { headers: admin }));
  const result = await read(await request.get(`/api/search/search?q=${keyword}`));
  expect(result.hits).toHaveLength(1);
  expect(result.hits[0].countryCode).toBe('');
  expect(result.hits[0].jurisdictionId).toBe(jurisdiction.id);
  await page.goto(`/search?q=${keyword}`);
  await page.locator('.search-hits h2 a').click();
  await expect(page).toHaveURL(new RegExp(`/jurisdictions/${jurisdiction.id}/versions/${published.versionId}#`));
  await expect(page.getByText(`Exact authored wording ${keyword}.`, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(`Exact authored wording ${keyword}.`, { exact: true })).toBeVisible();
});
