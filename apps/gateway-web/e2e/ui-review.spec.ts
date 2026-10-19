import { test, expect } from './fixtures/consent';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { uiRoutes, uiStates } from './fixtures/ui-routes';

const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
const sizes = [390, 820, 1440];
const axePath = path.join(process.cwd(), 'node_modules/axe-core/axe.min.js');

test('the review inventory includes every page entry point', () => {
  function pages(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? pages(path.join(directory, entry.name)) : entry.name === 'page.tsx' ? [path.dirname(path.join(directory, entry.name)).replace(/^app/, '') || '/'] : []);
  }
  expect(uiRoutes.map(route => route.entry).sort()).toEqual(pages('app').sort());
});

for (const locale of ['en', 'de']) for (const width of sizes) {
  test(`every page is usable in ${locale} at ${width}px`, async ({ browser, request }, testInfo) => {
    test.setTimeout(300_000);
    expect((await request.post(`${mock}/__reset`)).ok()).toBeTruthy();
    expect((await request.post(`${mock}/__sprint59_content`)).ok()).toBeTruthy();
    expect((await request.post(`${mock}/api/identity/login`, { data: { email: 'local-admin@example.local', password: 'change-me' } })).ok()).toBeTruthy();
    expect((await request.post(`${mock}/api/identity/login/mfa`, { data: { challengeToken: 'e2e-mfa-challenge', code: '123456' } })).ok()).toBeTruthy();
    const baseURL = String(testInfo.project.use.baseURL);
    const publicContext = await browser.newContext({ baseURL, locale, viewport: { width, height: 900 } });
    const staffContext = await browser.newContext({ baseURL, locale, viewport: { width, height: 900 } });
    await staffContext.addCookies([{ name: 'ca_session', value: 'e2e-session-token', url: baseURL, httpOnly: true, sameSite: 'Lax' }]);
    await publicContext.addCookies([{ name: 'ca_mfa_challenge', value: 'e2e-mfa-challenge', url: baseURL, httpOnly: true, sameSite: 'Lax' }]);
    for (const context of [publicContext, staffContext]) {
      await context.addInitScript(() => localStorage.setItem('ca_cookie_notice_v1', 'dismissed'));
      await context.route('**/setup/transport/status', route => route.fulfill({ json: { ready: true, message: locale === 'en' ? 'Local connection ready.' : 'Lokale Verbindung bereit.' } }));
    }
    const publicPage = await publicContext.newPage();
    const staffPage = await staffContext.newPage();
    const evidence: Array<{ route: string; status: number | undefined; heading: string | null }> = [];
    try {
      for (const route of [...uiRoutes, ...uiStates]) await test.step(route.entry, async () => {
        if ('setup' in route && route.setup) await request.post(`${mock}/__sprint59_setup`, { data: { completed: false } });
        if ('session' in route && route.session) expect((await request.post(`${mock}/api/editor/edit-sessions`, { data: { versionId: '01900000-0000-4000-8000-000000000804', hopKind: 'editorial_correction' } })).ok()).toBeTruthy();
        const page = 'staff' in route && route.staff ? staffPage : publicPage;
        const response = await page.goto(route.path);
        expect(response?.status(), route.path).toBeLessThan(400);
        const expectedPath = route.entry === '/versions/[versionId]/units/[unitId]' ? `/countries/DE${route.path}` : new URL(route.path, baseURL).pathname;
        await expect.poll(() => new URL(page.url()).pathname, { message: `Unexpected redirect for ${route.path}` }).toBe(expectedPath);
        await expect(page.locator('h1')).toHaveCount(1);
        await expect(page.locator('h1')).toBeVisible();
        await expect(page.locator('main')).toHaveAttribute('id', 'main-content');
        const heading = await page.locator('h1').textContent();
        expect(heading).not.toMatch(/Something went wrong|Etwas ist schief|not found|nicht gefunden/i);
        await expect(page.getByRole('alert').filter({ hasText: /could not be loaded|could not be retrieved|temporarily unavailable|konnte[n]? nicht geladen|vorübergehend nicht verfügbar/i })).toHaveCount(0);
        if (route.entry === '/admin/settings') await expect(page.locator('#smtpHost')).toBeVisible();
        if (route.entry === '/admin/import/setup/[proposalId]') await expect(page.locator('.page-meta')).toContainText(locale === 'en' ? 'Awaiting structure review' : 'Struktur wartet auf Prüfung');
        if (route.entry === '/editor/lifecycle/[constitutionId]') await expect(page.locator('input[name="logicalUnitIds"]').first()).toBeVisible();
        if (route.entry === '/setup') {
          await expect(page.getByRole('button', { name: locale === 'en' ? 'Finish setup and open the site' : 'Einrichtung abschließen und Website öffnen' })).toBeDisabled();
          await expect(page.getByRole('button', { name: locale === 'en' ? 'Account menu' : 'Kontomenü' })).toBeVisible();
          await expect(page.locator('.nav-primary a')).toHaveCount(0);
        }
        if (route.entry === 'import-new-structure') await expect(page.locator('#proposalFile')).toBeVisible();
        if (route.entry === 'editor-active-correction') await expect(page.getByRole('button', { name: locale === 'en' ? 'Save draft' : 'Entwurf speichern', exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Page overflow at ${route.path}`).toBeTruthy();
        if (width === 390 || width === 1440) {
          await page.addScriptTag({ path: axePath });
          const violations = await page.evaluate(async () => {
            // @ts-expect-error axe is injected for the audit
            return (await window.axe.run(document)).violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }));
          });
          expect(violations, `${locale} ${route.path}`).toEqual([]);
        }
        if ('snapshot' in route && route.snapshot && process.platform === 'linux' && process.env.E2E_SKIP_VISUAL !== 'true') {
          const name = route.entry.replace(/\//g, '-').replace(/[\[\]]/g, '').replace(/^-/, '');
          await expect(page).toHaveScreenshot(`review-${name}-${locale}-${width}.png`, { fullPage: true, timeout: 15_000 });
        }
        evidence.push({ route: route.entry, status: response?.status(), heading });
        if ('setup' in route && route.setup) await request.post(`${mock}/__sprint59_setup`, { data: { completed: true } });
      });
      await testInfo.attach(`route-audit-${locale}-${width}.json`, { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
    } finally { await publicContext.close(); await staffContext.close(); }
  });
}

for (const locale of ['en', 'de']) test(`secondary controls work by keyboard with narrow reflow in ${locale}`, async ({ browser, request }, testInfo) => {
  expect((await request.post(`${mock}/__reset`)).ok()).toBeTruthy();
  expect((await request.post(`${mock}/__sprint59_content`)).ok()).toBeTruthy();
  await request.post(`${mock}/api/identity/login`, { data: { email: 'local-admin@example.local', password: 'change-me' } });
  await request.post(`${mock}/api/identity/login/mfa`, { data: { challengeToken: 'e2e-mfa-challenge', code: '123456' } });
  const baseURL = String(testInfo.project.use.baseURL);
  const context = await browser.newContext({ baseURL, locale, viewport: { width: 320, height: 900 } });
  await context.addCookies([{ name: 'ca_session', value: 'e2e-session-token', url: baseURL }]);
  await context.addInitScript(() => localStorage.setItem('ca_cookie_notice_v1', 'dismissed'));
  const page = await context.newPage();
  try {
    for (const path of ['/admin/import?mode=new', '/account', '/admin/legal/datenschutz', '/countries/DE/constitution-timeline?on=2026-01-01']) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), path).toBeTruthy();
    }
    await page.goto('/admin/import?mode=new');
    const disclosure = page.locator('summary').filter({ hasText: locale === 'en' ? 'Paste JSON instead' : 'Stattdessen JSON einfügen' });
    const editor = page.locator('#proposal');
    await expect(editor).toBeHidden();
    await disclosure.focus();
    await page.keyboard.press('Enter');
    await expect(editor).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(editor).toBeFocused();
    await disclosure.focus();
    await page.keyboard.press('Enter');
    await expect(editor).toBeHidden();
  } finally { await context.close(); }
});
