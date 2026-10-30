import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '../fixtures/consent';
import { signIn } from './auth';

type Scenario = { href: string; state: string; versionId?: string; revisedVersionId?: string; sessionId?: string; jobId?: string; jurisdictionId?: string; documents?: Record<string, { href: string }> };
const index = JSON.parse(readFileSync(join(__dirname, '../fixtures/generated/.runtime/scenario-index.json'), 'utf8')) as { profile: string; scenarios: Record<string, Scenario> };
const scenarios = index.scenarios;
test.skip(index.profile === 'compact', 'Exploration scenarios require the extended or scale profile');

test('non-standard structures retain authored order, skipped levels and shared notes in the real reader', async ({ page, request }, testInfo) => {
  const fixture = scenarios['reader-lab'];
  const response = await request.get(`/api/content/versions/${fixture.versionId}/content`);
  expect(response.ok()).toBeTruthy();
  const snapshot = await response.json();
  expect(snapshot.roots.map((root: { kind: string }) => root.kind)).toEqual(['preamble', 'article', 'article', 'appendix']);
  const article = snapshot.roots[1];
  expect(article.label).toBe('Art. I a'); expect(article.title).toBeNull();
  expect(article.content.filter((entry: { node?: { kind: string } }) => entry.node).map((entry: { node: { kind: string } }) => entry.node.kind)).toContain('sentence');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(fixture.href);
  await page.getByRole('button', { name: 'Full text', exact: true }).click();
  await expect(page.getByText('An untitled and unnumbered preamble opens the instrument.', { exact: true })).toBeVisible();
  await expect(page.getByText('This sentence skips the optional paragraph level.', { exact: true })).toBeVisible();
  await expect(page.getByText('Unnumbered text between provisions.', { exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Exploration duties' })).toBeVisible();
  const markers = page.getByRole('button', { name: /^Show footnote / });
  await expect(markers).toHaveCount(2);
  await markers.first().click();
  await expect(page.getByRole('dialog')).toContainText('Shared editorial note for two articles.');
  await page.keyboard.press('Escape');
  await markers.last().click();
  await expect(page.getByRole('dialog')).toContainText('Shared editorial note for two articles.');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: testInfo.outputPath('fixture-irregular-reader-mobile.png'), fullPage: true });
  const exported = await (await request.get(`/api/content/versions/${fixture.versionId}/export`)).json();
  expect(exported.roots.at(-1).content.at(-1).footnoteLabel).toBe('[a]');
});

test('the irregular successor retains moved identities, additions and historical links', async ({ page, request }, testInfo) => {
  const fixture = scenarios['reader-lab'];
  const before = await (await request.get(`/api/content/versions/${fixture.versionId}/content`)).json();
  const after = await (await request.get(`/api/content/versions/${fixture.revisedVersionId}/content`)).json();
  expect(after.roots[2].logicalId).toBe(before.roots[1].logicalId);
  const moved = before.roots.at(-1).content.find((entry: { node?: { kind: string } }) => entry.node?.kind === 'clause').node;
  expect(after.roots[2].content.some((entry: { node?: { logicalId: string } }) => entry.node?.logicalId === moved.logicalId)).toBe(true);
  await page.goto(`/countries/XA/compare?from=${fixture.versionId}&to=${fixture.revisedVersionId}&all=1`);
  await expect(page.getByText('Exploration duties', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('fixture-irregular-compare.png'), fullPage: true });
  await page.goto(fixture.href);
  await page.getByRole('button', { name: 'Full text', exact: true }).click();
  await expect(page.getByText('This clause is removed in the successor.', { exact: true })).toBeVisible();
});

test('seeded queues expose saved work while unpublished import content stays private', async ({ page, request }) => {
  await signIn(page, 'reviewer');
  await page.goto(scenarios['editor-review'].href);
  await expect(page.getByRole('button', { name: 'Approve review', exact: true })).toBeVisible();
  await expect(page.getByText('Saved draft for editor-review. This unpublished exploration text is private.', { exact: true }).first()).toBeVisible();
  const draft = scenarios['import-review'];
  const response = await request.get(`/api/content/versions/${draft.versionId}/content`);
  expect(response.status()).toBe(404);
  const search = await (await request.get(`/api/search/search?q=Explorationneedle&versionId=${draft.versionId}`)).json();
  expect(search.total).toBe(0);
});

test('historical regions, captured documents and curated counterparts are available after prepopulation', async ({ page }) => {
  await page.goto(scenarios['historical-region'].href);
  await expect(page.getByText('nach 1849', { exact: true }).first()).toBeVisible();
  await page.goto(scenarios['documents-context'].documents!.pdf.href);
  await expect(page.getByRole('link', { name: 'Download synthetic-source.pdf' })).toBeVisible();
  await page.goto(scenarios['curated-comparison'].href.replace('topic=0', 'topic=1'));
  await expect(page.getByText('No counterpart recorded in this source comparison.', { exact: true })).toBeVisible();
});
