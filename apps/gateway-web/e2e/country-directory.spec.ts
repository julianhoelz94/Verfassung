import { expect, test } from './fixtures/consent';
import { signInAdmin } from './helpers';
import path from 'node:path';

const mockOrigin = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
const regionId = '07100000-0000-4000-8000-000000000001';
const formerId = '07100000-0000-4000-8000-000000000002';
const oldId = '07200000-0000-4000-8000-000000000001';
const correctionId = '07200000-0000-4000-8000-000000000003';
const regionalConstitution = '07300000-0000-4000-8000-000000000001';

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${mockOrigin}/__reset`)).ok()).toBeTruthy();
  expect((await request.post(`${mockOrigin}/__sprint50_content`)).ok()).toBeTruthy();
  expect((await request.post(`${mockOrigin}/__country_directory`, { data: {} })).ok()).toBeTruthy();
});

for (const width of [390, 820, 1440]) test(`country directory preserves controls and ownership at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/countries/DE');
  const countryMenu = await page.getByRole('navigation', { name: 'Country tools' }).boundingBox();
  expect(countryMenu?.x).toBeCloseTo(0, 0);
  expect(countryMenu?.width).toBe(await page.evaluate(() => document.documentElement.clientWidth));
  await expect(page.getByRole('navigation', { name: 'Contents', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'National constitutions', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Regional constitutions', exact: true })).toBeVisible();
  await expect(page.locator('#historical-national')).toContainText('Archived National Charter');
  await expect(page.locator('#historical-national')).not.toContainText('Basic Law');
  await expect(page.getByRole('heading', { name: 'Nested City', exact: true })).toBeVisible();
  await expect(page.getByText('Historical jurisdiction', { exact: true })).toBeVisible();
  await expect(page.getByText('PRIVATE DRAFT', { exact: true })).toHaveCount(0);
  await expect(page.getByText('PRIVATE CONSTITUTION', { exact: true })).toHaveCount(0);
  const entries = page.getByRole('article');
  await expect(entries).toHaveCount(6);
  for (const entry of await entries.all()) {
    await expect(entry.getByRole('link', { name: 'Read latest', exact: true })).toBeVisible();
    await expect(entry.getByText('Available versions', { exact: true })).toBeVisible();
    await expect(entry.getByText('Compare versions', { exact: true })).toBeVisible();
    await expect(entry.locator('summary').filter({ hasText: /^Version history/ })).toBeVisible();
    await expect(entry.getByRole('link', { name: 'About this constitution', exact: true })).toBeVisible();
  }
  const regional = page.getByRole('article', { name: 'Example Regional Constitution', exact: true });
  await expect(regional.getByRole('link', { name: 'Read latest' })).toHaveAttribute('href', `/jurisdictions/${regionId}/versions/${correctionId}`);
  await expect(regional.getByRole('link', { name: '2020', exact: true })).toHaveAttribute('href', `/jurisdictions/${regionId}/versions/${correctionId}`);
  await regional.locator('summary').filter({ hasText: /^Version history/ }).click();
  await expect(regional.getByRole('link', { name: 'Read', exact: true }).last()).toHaveAttribute('href', `/jurisdictions/${regionId}/versions/${correctionId}`);
  await regional.getByText('Compare versions', { exact: true }).click();
  await expect(regional.getByRole('combobox', { name: 'From', exact: true })).toBeVisible();
  await expect(regional.getByRole('combobox', { name: 'To', exact: true })).toHaveValue(correctionId);
  const historic = page.getByRole('article', { name: 'Earlier Regional Constitution', exact: true });
  await expect(historic.getByRole('button', { name: 'Compare versions' })).toBeDisabled();
  await expect(historic).toContainText('Comparison requires at least two available versions.');
  await expect(page.getByRole('article', { name: 'Municipal Charter' })).toContainText('Suspended');
  await expect(page.locator('#historical-07100000-0000-4000-8000-000000000003')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const duplicateIds = await page.locator('[id]').evaluateAll(elements => { const ids = elements.map(element => element.id); return ids.filter((id, index) => ids.indexOf(id) !== index); });
  expect(duplicateIds).toEqual([]);
  await regional.getByRole('link', { name: 'Read latest', exact: true }).click();
  const readerMenu = await page.getByRole('toolbar', { name: 'Reading options' }).boundingBox();
  expect(readerMenu?.x).toBeCloseTo(0, 0);
  expect(readerMenu?.width).toBe(countryMenu?.width);
});

for (const width of [390, 1440]) test(`country contents navigate and collapse without losing the entry at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/countries/DE');
  const contents = page.getByRole('navigation', { name: 'Contents', exact: true });
  await expect(contents.getByRole('link', { name: 'Historical national constitutions', exact: true })).toBeVisible();
  await contents.getByRole('link', { name: 'Nested City', exact: true }).click();
  await expect(page).toHaveURL(/#region-07100000-0000-4000-8000-000000000003$/);
  const heading = page.getByRole('heading', { name: 'Nested City', exact: true });
  await expect(heading).toBeInViewport();
  await expect(contents.getByRole('link', { name: 'Nested City', exact: true })).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Hide table of contents' }).click();
  await expect(contents).toHaveCount(0);
  await expect(heading).toBeInViewport();
  await page.getByRole('button', { name: 'Show table of contents' }).focus();
  await page.keyboard.press('Enter');
  await expect(contents).toBeVisible();
  await contents.getByRole('link', { name: 'Archived National Charter', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Archived National Charter' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('regional reading, comparison and overview retain the current published snapshot', async ({ page }) => {
  await page.goto('/countries/DE');
  const regional = page.getByRole('article', { name: 'Example Regional Constitution', exact: true });
  await regional.getByRole('link', { name: 'Read latest', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/jurisdictions/${regionId}/versions/${correctionId}$`));
  await expect(page.getByText(/Corrected spelling/)).toBeVisible();
  await page.goto('/countries/DE');
  await regional.getByText('Compare versions', { exact: true }).click();
  await expect(regional.getByRole('combobox', { name: 'From', exact: true })).toHaveValue(oldId);
  await expect(regional.getByRole('combobox', { name: 'To', exact: true })).toHaveValue(correctionId);
  await regional.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/jurisdictions/${regionId}/compare\\?from=${oldId}&to=${correctionId}$`));
  await expect(page.getByRole('heading', { name: /side by side/ })).toBeVisible();
  await expect(page.locator('.compare-col-to')).toContainText('Corrected spelling.');
  await expect(page.getByRole('combobox', { name: 'To', exact: true })).toHaveValue(correctionId);
  await page.getByRole('link', { name: /Show all/ }).click();
  await expect(page).toHaveURL(new RegExp(`to=${correctionId}&all=1$`));
  await expect(page.locator('.compare-col-to')).toContainText('Corrected spelling.');
  await page.goto('/countries/DE');
  await regional.getByRole('link', { name: 'About this constitution' }).click();
  await expect(page).toHaveURL(`/jurisdictions/${regionId}/constitutions/${regionalConstitution}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Example Regional Constitution');
  await expect(page.getByRole('link', { name: 'Read latest' })).toHaveAttribute('href', `/jurisdictions/${regionId}/versions/${correctionId}`);
  await expect(page.getByRole('link', { name: 'Earlier Regional Constitution' })).toHaveAttribute('href', `/jurisdictions/${regionId}/constitutions/07300000-0000-4000-8000-000000000002`);
});

test('wrong-region and cross-constitution selections never render a comparison', async ({ page }) => {
  await page.goto(`/jurisdictions/${formerId}/versions/${correctionId}`);
  await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible();
  await expect(page.getByText('Corrected spelling.')).toHaveCount(0);
  await page.goto(`/jurisdictions/${regionId}/compare?from=${oldId}&to=07200000-0000-4000-8000-000000000005`);
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: /side by side/ })).toHaveCount(0);
  await page.goto(`/jurisdictions/${regionId}/compare?from=${oldId}&to=07200000-0000-4000-8000-000000000099`);
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(page.getByText('PRIVATE DRAFT')).toHaveCount(0);
});

test('regional directories retain historical constitutions and nested-region navigation', async ({ page }) => {
  await page.goto('/countries/DE');
  await page.getByRole('heading', { name: 'Example Region', exact: true }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Example Region');
  await expect(page.getByRole('navigation', { name: 'Regional tools' })).toBeVisible();
  const contents = page.getByRole('navigation', { name: 'Contents', exact: true });
  await expect(contents.getByRole('link', { name: 'Earlier Regional Constitution', exact: true })).toBeVisible();
  const historic = page.getByRole('article', { name: 'Earlier Regional Constitution', exact: true });
  await expect(historic.getByRole('link', { name: 'Read latest' })).toBeVisible();
  await expect(historic.getByRole('button', { name: 'Compare versions' })).toBeDisabled();
  await historic.getByText('Version history (1)', { exact: true }).click();
  await expect(historic.getByRole('link', { name: 'Read', exact: true })).toHaveAttribute('href', `/jurisdictions/${regionId}/versions/07200000-0000-4000-8000-000000000004`);
  await page.getByRole('link', { name: 'Nested City', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nested City');
  await expect(page.getByRole('article', { name: 'Municipal Charter' })).toContainText('Suspended');
});

test('former jurisdictions have explicit regional pages with the shared menu and contents', async ({ page }) => {
  await page.goto('/countries/DE');
  const former = page.getByRole('region', { name: 'Former Province', exact: true });
  await expect(former).toContainText('Until January 1, 1950');
  await expect(former).not.toContainText('Not recorded');
  await former.getByRole('link', { name: 'Open regional page', exact: true }).click();
  await expect(page).toHaveURL(`/jurisdictions/${formerId}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Former Province');
  await expect(page.getByRole('navigation', { name: 'Regional tools' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Contents', exact: true }).getByRole('link', { name: 'Former Provincial Charter', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Historical jurisdiction · Until January 1, 1950');
});

test('national and individual history links state their scope and include historical and regional records', async ({ page }) => {
  await page.goto('/countries/DE');
  await expect(page.getByRole('navigation', { name: 'Country tools' }).getByRole('link')).toHaveCount(0);
  await page.getByRole('link', { name: 'National constitutional history', exact: true }).click();
  await expect(page.getByRole('main')).toContainText('Archived National Charter');
  await expect(page.getByRole('main')).not.toContainText('PRIVATE CONSTITUTION');
  await expect(page.getByRole('main')).not.toContainText('Example Regional Constitution');
  for (const [owner, constitutionId, title] of [
    ['countries/DE', '07300000-0000-4000-8000-000000000003', 'Archived National Charter'],
    [`jurisdictions/${regionId}`, regionalConstitution, 'Example Regional Constitution'],
    [`jurisdictions/${regionId}`, '07300000-0000-4000-8000-000000000002', 'Earlier Regional Constitution'],
    [`jurisdictions/${formerId}`, '07300000-0000-4000-8000-000000000004', 'Former Provincial Charter'],
  ]) {
    await page.goto(`/${owner}/constitutions/${constitutionId}`);
    const history = page.getByRole('region', { name: 'Constitutional history', exact: true });
    await expect(history).toContainText(`Recorded event for ${title}`);
    await expect(history.getByRole('link', { name: 'Amendment history' })).toHaveAttribute('href', `/constitutions/${constitutionId}/amendments`);
    await history.getByRole('link', { name: 'Amendment history' }).click();
    await expect(page.getByRole('heading', { name: 'Amendment register', exact: true })).toBeVisible();
    await expect(page.getByText('No published amendments match these filters.')).toBeVisible();
  }
});

test('partial regional failure keeps national and other regional collections readable', async ({ page, request }) => {
  expect((await request.post(`${mockOrigin}/__country_directory`, { data: { unavailable: [formerId] } })).ok()).toBeTruthy();
  await page.goto('/countries/DE');
  await expect(page.getByRole('article', { name: 'Basic Law for the Federal Republic of Germany' }).getByRole('link', { name: 'Read latest' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Example Regional Constitution' })).toBeVisible();
  await expect(page.getByText('Some regional collections could not be loaded. Please try again.')).toBeVisible();
  await expect(page.getByText('No regional constitutions are published yet.')).toHaveCount(0);
});

test('background and authorized country tools remain discoverable', async ({ page }) => {
  await page.goto('/countries/DE');
  await expect(page.getByRole('heading', { name: 'About Germany' })).toBeHidden();
  await page.getByRole('button', { name: 'Background', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'About Germany' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Source 1' })).toHaveAttribute('href', 'https://example.org/country-history');
  await expect(page.getByRole('link', { name: 'Edit country page' })).toHaveCount(0);
  await signInAdmin(page);
  await page.goto('/countries/DE');
  await page.getByRole('button', { name: 'Background', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Edit country page' })).toBeVisible();
  const national = page.getByRole('article', { name: 'Basic Law for the Federal Republic of Germany' });
  await national.getByText('Structure and editorial details', { exact: true }).click();
  await expect(national.getByRole('link', { name: 'Record lifecycle event' })).toBeVisible();
});

test.describe('German country directory', () => {
test.use({ locale: 'de-DE' });
test('German country chrome and headings preserve reading controls', async ({ page }) => {
  await page.goto('/countries/DE');
  await expect(page.getByRole('heading', { name: 'Nationale Verfassungen', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Regionale Verfassungen', exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Example Regional Constitution' }).getByRole('link', { name: 'Neueste Fassung lesen' })).toBeVisible();
});
});

test('directory and expanded reading controls are keyboard accessible and pass axe', async ({ page }) => {
  await page.goto('/countries/DE');
  const versionHistory = page.getByRole('article', { name: 'Example Regional Constitution', exact: true }).locator('summary').filter({ hasText: /^Version history/ });
  await versionHistory.focus();
  await page.keyboard.press('Enter');
  await expect(versionHistory.locator('..').getByRole('link', { name: 'Read', exact: true })).toHaveCount(2);
  await page.addScriptTag({ path: path.join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => {
    // @ts-expect-error axe is injected for the browser acceptance check.
    return (await window.axe.run(document)).violations;
  });
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
});

test('country directory screenshots at phone, tablet and desktop widths', async ({ page, request }) => {
  test.skip(process.platform !== 'linux', 'Pinned Linux Chromium screenshot baselines.');
  for (const [width, suffix] of [[390, 'narrow'], [820, 'tablet'], [1440, 'wide']] as const) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : width === 820 ? 1180 : 900 });
    await request.post(`${mockOrigin}/__sprint50_content`);
    await request.post(`${mockOrigin}/__country_directory`, { data: {} });
    await page.goto('/countries/DE');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page).toHaveScreenshot(`country-directory-${suffix}.png`, { fullPage: true });
    await request.post(`${mockOrigin}/__reset`);
    await page.goto('/countries/DE');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page).toHaveScreenshot(`country-${suffix}.png`, { fullPage: true });
  }
});
