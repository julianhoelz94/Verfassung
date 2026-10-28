import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '../fixtures/consent';

const ids = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'generated', '.runtime', 'prepopulate-ids.json'), 'utf8')) as { versions: Record<string, string> };
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('mixed roots and rich entries survive API publication and read on a narrow screen', async ({ page, request }) => {
  const version = ids.versions['xc-2024'];
  const snapshot = await (await request.get(`/api/content/versions/${version}/content`)).json();
  expect(snapshot.roots.map((root: { kind: string }) => root.kind)).toEqual(['preamble', 'article', 'appendix']);
  const [preamble, article, appendix] = snapshot.roots;
  expect(appendix.title).toBeNull();
  expect(appendix.content[1].table.rows[2].cells[0].colSpan).toBe(2);
  expect(article.content[0].references.map((ref: { target: { type: string } }) => ref.target.type)).toEqual(['footnote', 'unit']);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/countries/XC/versions/${version}/units/${preamble.occurrenceId}`);
  await expect(page.getByText('We establish this charter.')).toBeVisible();
  await page.goto(`/countries/XC/versions/${version}/units/${appendix.occurrenceId}`);
  await expect(page.getByRole('table', { name: 'Civic duties' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Biennial' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Applies nationally' })).toHaveAttribute('colspan', '2');
  await page.goto(`/countries/XC/versions/${version}/articles/${article.occurrenceId}`);
  await expect(page.getByRole('link', { name: 'Appendix A' })).toHaveAttribute('href', new RegExp(`/versions/${version}/units/${appendix.occurrenceId}`));
  const marker = page.getByRole('button', { name: 'Show footnote 1', exact: true });
  const markerSize = await marker.boundingBox();
  expect(markerSize!.height).toBeLessThanOrEqual(28);
  const position = await page.evaluate(() => window.scrollY);
  await marker.click();
  expect(await page.evaluate(() => window.scrollY)).toBe(position);
  const drawer = page.getByRole('dialog', { name: 'Footnote 1', exact: true });
  await expect(drawer).toContainText('The revised source note.');
  await expect(drawer.getByRole('link', { name: 'Go to footnote', exact: true })).toHaveAttribute('href', new RegExp(`/versions/${version}#fn-`));
  await drawer.getByRole('link', { name: 'Go to footnote', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/versions/${version}#fn-`));
  await expect(page.getByRole('note').filter({ hasText: 'The revised source note.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Source', exact: true })).toHaveAttribute('href', 'https://example.org/atlas-e2e/revised-source');
});

test('rich table, note and reference changes appear in compare and search', async ({ page, request }) => {
  const from = ids.versions['xc-2020'];
  const to = ids.versions['xc-2024'];
  await page.goto(`/countries/XC/compare?from=${from}&to=${to}&all=1`);
  await expect(page.getByText('Annual', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Biennial', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.legal-table').first()).toBeVisible();
  const search = await (await request.get(`/api/search/search?q=Biennial&country=XC&versionId=${to}`)).json();
  expect(search.total).toBe(1);
  await page.goto('/search');
  await page.getByLabel('Keyword').fill('Biennial');
  await page.locator('main').getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('Biennial').first()).toBeVisible();
});
