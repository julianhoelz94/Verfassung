import { test, expect } from './fixtures/consent';
import { signInAdmin, signInReviewer } from './helpers';
const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
test.beforeEach(async ({ request }) => {
  await request.post(`${mock}/__reset`); await request.post(`${mock}/__sprint59_content`);
  await request.post(`${mock}/__import_review`, { data: {} });
});
for (const locale of ['en', 'de']) for (const width of [390, 820, 1440]) {
  test(`shared import collection retains uploads and filters in ${locale} at ${width}px`, async ({ page, request }, info) => {
    await page.setViewportSize({ width, height: 1000 }); await signInAdmin(page);
    await request.put(`${mock}/api/identity/me/language`, { headers: { Authorization: 'Bearer e2e-session-token' }, data: { languagePreference: locale } });
    await page.goto('/import');
    const en = locale === 'en', toolbar = page.getByRole('toolbar');
    expect((await toolbar.boundingBox())!.x).toBe(0); expect((await toolbar.boundingBox())!.width).toBe(width);
    await expect(page.locator('main')).toHaveCount(1); await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    expect(await page.locator('[data-work-collection] header').evaluate(node => getComputedStyle(node).borderBottomWidth)).toBe('0px');
    await expect(page.locator('a[href="/import/jobs/01900000-0000-4000-8000-000000008630"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: en ? 'Continue' : 'Fortsetzen', exact: true })).toBeVisible();
    await page.getByRole('button', { name: en ? 'Filters' : 'Filter', exact: true }).click();
    await page.getByRole('combobox', { name: en ? 'Type' : 'Art', exact: true }).selectOption('package');
    await expect(page.locator('#imports-panel-queue li')).toHaveCount(1);
    await page.getByRole('combobox', { name: en ? 'Type' : 'Art', exact: true }).focus(); await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: en ? 'Filters' : 'Filter', exact: true })).toBeFocused();
    await page.getByRole('button', { name: en ? 'Remove filter: Packages' : 'Filter entfernen: Pakete', exact: true }).click();
    await page.getByRole('searchbox', { name: en ? 'Search imports' : 'Importe durchsuchen' }).fill('absent constitution');
    await expect(page.getByRole('heading', { name: en ? 'No matching imports' : 'Keine passenden Importe' })).toBeVisible();
    await page.getByRole('button', { name: en ? 'Clear search and filters' : 'Suche und Filter zurücksetzen', exact: true }).click();
    await page.screenshot({ path: info.outputPath(`imports-${locale}-${width}.png`), fullPage: true });
    await page.getByRole('tab', { name: en ? 'New import' : 'Neuer Import', exact: true }).click();
    await page.locator('#file').setInputFiles({ name: 'retained.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') });
    await page.locator('#upload summary').click(); await page.locator('#payload').fill('{unfinished');
    await page.getByRole('button', { name: en ? 'Hide context' : 'Kontext ausblenden', exact: true }).click();
    await page.getByRole('tab', { name: en ? 'Overview' : 'Übersicht', exact: true }).click();
    await page.getByRole('tab', { name: en ? 'New import' : 'Neuer Import', exact: true }).click();
    await page.getByRole('radio', { name: en ? /^New constitution/ : /^Neue Verfassung/ }).check();
    await page.getByRole('radio', { name: en ? /^Existing constitution/ : /^Bestehende Verfassung/ }).check();
    expect(await page.locator('#file').evaluate((node: HTMLInputElement) => node.files?.[0]?.name)).toBe('retained.json');
    await expect(page.locator('#payload')).toHaveValue('{unfinished');
    await page.getByRole('button', { name: en ? 'Stage for review' : 'Zur Prüfung vorbereiten', exact: true }).click();
    await expect(page.locator('#upload').getByRole('alert')).toBeVisible(); await expect(page.locator('#payload')).toHaveValue('{unfinished');
    expect(await page.locator('#file').evaluate((node: HTMLInputElement) => node.files?.[0]?.name)).toBe('retained.json');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`import-upload-${locale}-${width}.png`), fullPage: true });
    await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
    expect(await page.evaluate(async () => (await (window as unknown as { axe: { run: (node: Document) => Promise<{ violations: unknown[] }> } }).axe.run(document)).violations)).toEqual([]);
  });
}
test('legacy POST dispatch still stages without publishing; legacy reads retain fragments', async ({ page }) => {
  await signInAdmin(page); await page.goto('/admin/import?mode=existing#upload');
  await expect(page).toHaveURL(/\/import\?mode=existing#upload$/);
  await page.route(url => url.pathname === '/import', async route => {
    if (route.request().method() === 'POST' && route.request().headers()['next-action']) await route.continue({ url: new URL('/admin/import?mode=existing', page.url()).href });
    else await route.continue();
  });
  await page.locator('#upload summary').click();
  await page.locator('#payload').fill(JSON.stringify({ isoCode: 'US', countryName: 'United States', constitutionSlug: 'charter', constitutionTitle: 'Legacy POST charter', versionLabel: '2026', articles: [{ articleNumber: '1', title: 'Rights', body: 'Rights are protected.' }] }));
  await page.getByRole('button', { name: 'Stage for review', exact: true }).click();
  await expect(page).toHaveURL(/\/import\/jobs\//); await expect(page.getByRole('heading', { name: 'Review import', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the published version' })).toHaveCount(0);
});
test('reviewers inspect imports without an upload action', async ({ page }) => {
  await signInReviewer(page); await page.goto('/import?mode=new');
  await expect(page.getByRole('tab', { name: 'New import', exact: true })).toHaveCount(0); await expect(page.locator('input[type=file]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Continue', exact: true })).toBeVisible();
});
test('the complete next-action label and arrow survive narrow and enlarged-text reflow', async ({ page, request }) => {
  await signInAdmin(page);
  for (const locale of ['en', 'de']) {
    await request.put(`${mock}/api/identity/me/language`, { headers: { Authorization: 'Bearer e2e-session-token' }, data: { languagePreference: locale } });
    for (const width of [320, 390, 680, 789, 820, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto('/import');
      if (width === 789) await page.addStyleTag({ content: 'html { font-size:32px !important; }' });
      const action = page.getByRole('link', { name: locale === 'en' ? 'Continue' : 'Fortsetzen', exact: true });
      const geometry = await action.evaluate(node => {
        const range = document.createRange(); range.selectNodeContents(node.querySelector('span')!);
        const label = [...range.getClientRects()].filter(rect => rect.width > 0), box = node.getBoundingClientRect(), arrow = node.querySelector('svg')!.getBoundingClientRect();
        return { lines: label.length, fits: node.scrollWidth <= node.clientWidth + 1, aligned: Math.abs(arrow.top + arrow.height / 2 - box.top - box.height / 2) < 1 };
      });
      expect(geometry).toEqual({ lines: 1, fits: true, aligned: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
  }
});
