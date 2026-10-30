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
  await expect(page.getByText('An untitled and unnumbered preamble opens the instrument.', { exact: true })).toBeVisible();
  await expect(page.getByText('This sentence skips the optional paragraph level.', { exact: true })).toBeVisible();
  await expect(page.getByText('Unnumbered text between provisions.', { exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Exploration duties' })).toBeVisible();
  await page.getByRole('button', { name: 'Find in text', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find in constitution', exact: true }).fill('skips the optional paragraph level');
  await expect(page.getByRole('status').filter({ hasText: '1 of 1 matches' })).toBeVisible();
  await page.getByRole('button', { name: 'Close search', exact: true }).click();
  const markers = page.getByRole('button', { name: /^Show footnote / });
  await expect(markers).toHaveCount(2);
  await markers.first().click();
  await expect(page.getByRole('dialog')).toContainText('Shared editorial note for two articles.');
  await page.getByRole('link', { name: 'Go to footnote', exact: true }).click();
  const note = page.getByRole('note').filter({ hasText: 'Shared editorial note for two articles.' });
  await note.getByRole('button', { name: /Back to references/ }).click();
  await page.getByRole('menu', { name: 'Choose a footnote reference' }).getByRole('menuitem', { name: /Reference 2/ }).click();
  await expect(markers.last()).toBeInViewport();
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
  await expect(page.getByRole('region', { name: 'Original', exact: true }).getByRole('table', { name: 'Exploration duties' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Revised', exact: true }).getByText('This untitled clause changes parent in the successor.', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('fixture-irregular-compare.png'), fullPage: true });
  await page.goto(fixture.href);
  await expect(page.getByText('This clause is removed in the successor.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  const comparison = page.getByRole('region', { name: 'Compare publications', exact: true });
  await comparison.getByRole('combobox', { name: 'From', exact: true }).selectOption(fixture.versionId!);
  await comparison.getByRole('combobox', { name: 'To', exact: true }).selectOption(fixture.revisedVersionId!);
  await expect(comparison.getByRole('link', { name: 'Go to changed passage' }).first()).toBeVisible();
  await expect(comparison.locator('ins').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('fixture-irregular-reader-compare.png'), fullPage: true });
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
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('note').filter({ hasText: 'Date as described by the source: nach 1849' })).toBeVisible();
  await page.goto(scenarios['documents-context'].documents!.pdf.href);
  await expect(page.getByRole('link', { name: 'Download synthetic-source.pdf' })).toBeVisible();
  await page.goto(scenarios['curated-comparison'].href.replace('topic=0', 'topic=1'));
  await expect(page.getByText('No counterpart recorded in this source comparison.', { exact: true })).toBeVisible();
});


test('a saved irregular draft can be reopened in the continuous constitution editor', async ({ page }, testInfo) => {
  await signIn(page, 'editor');
  await page.goto(scenarios['layout-draft'].href);
  await page.getByRole('button', { name: 'Editor view', exact: true }).click();
  await page.getByRole('combobox', { name: 'Editor view', exact: true }).selectOption('constitution');
  await expect(page.locator('#draft-form input[name="scope"]')).toHaveValue('constitution');
  await page.locator('[data-editor-workspace]').getByRole('button', { name: 'Article Art. I a', exact: true }).click();
  await expect(page.locator('[data-editor-workspace]')).toContainText('Saved draft: parent wording around a child sentence.');
  await page.screenshot({ path: testInfo.outputPath('fixture-irregular-editor.png'), fullPage: true });
});
