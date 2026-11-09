import { test, expect, type Page, type APIRequestContext } from './fixtures/consent';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { uiRoutes, uiStates } from './fixtures/ui-routes';

const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
const sizes = [390, 820, 1440];
const snapshotEntries = process.env.E2E_SNAPSHOT_ENTRY?.split(',');
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
      for (const route of [...uiRoutes, ...uiStates].filter(route => !snapshotEntries || snapshotEntries.includes(route.entry))) await test.step(route.entry, async () => {
        await prepareReviewRoute(route, publicPage, request, locale);
        const page = 'staff' in route && route.staff ? staffPage : publicPage;
        const response = await page.goto(route.path);
        expect(response?.status(), route.path).toBeLessThan(400);
        const expectedPath = 'expectedPath' in route ? route.expectedPath : new URL(route.path, baseURL).pathname;
        await expect.poll(() => new URL(page.url()).pathname, { message: `Unexpected redirect for ${route.path}` }).toBe(expectedPath);
        const heading = await assertReviewPage(page, route, locale);
        await auditReviewAccessibility(page, route, locale, width);
        await captureReviewSnapshot(page, route, locale, width);
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
    for (const path of ['/admin/import?mode=new', '/account', '/admin/legal/datenschutz', '/countries/DE/timeline?on=2026-01-01']) {
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

type ReviewRoute = (typeof uiRoutes)[number] | (typeof uiStates)[number];

/** Stage setup/session variants before selecting or navigating either browser context. */
async function prepareReviewRoute(route: ReviewRoute, publicPage: Page, request: APIRequestContext, locale: string) {
  if ('setup' in route && route.setup) {
    await request.post(`${mock}/__sprint59_setup`, { data: { completed: false } });
    await publicPage.goto('/impressum');
    await expect(publicPage.locator('.topbar').getByRole('link', { name: locale === 'en' ? 'Log in' : 'Einloggen', exact: true })).toBeVisible();
    await expect(publicPage.locator('.nav-primary a')).toHaveCount(0);
  }
  if ('session' in route && route.session) expect((await request.post(`${mock}/api/editor/edit-sessions`, { data: { versionId: '01900000-0000-4000-8000-000000000804', hopKind: 'editorial_correction' } })).ok()).toBeTruthy();
}

/** Assert shared page landmarks, availability, task controls and overflow before audits. */
async function assertReviewPage(page: Page, route: ReviewRoute, locale: string) {
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('id', 'main-content');
  await expect(page.locator('main')).toHaveAttribute('data-template', /^(focused|settings|collection|reader|workspace)$/);
  const heading = await page.locator('h1').textContent();
  expect(heading).not.toMatch(/Something went wrong|Etwas ist schief|not found|nicht gefunden/i);
  await expect(page.getByRole('alert').filter({ hasText: /could not be loaded|could not be retrieved|temporarily unavailable|konnte[n]? nicht geladen|vorübergehend nicht verfügbar/i })).toHaveCount(0);
  await assertReviewControls(page, route, locale);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Page overflow at ${route.path}`).toBeTruthy();
  return heading;
}

/** Keep task-specific controls and setup safety assertions on their original route variants. */
async function assertReviewControls(page: Page, route: ReviewRoute, locale: string) {
  if (route.entry.startsWith('/admin/import') || route.entry.startsWith('/admin/migrations') || route.entry === 'import-review' || route.entry === 'import-new-structure') {
    const primary = page.locator('.nav-primary');
    await expect(primary.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(primary.locator('a[href="/admin/import"]')).toHaveAttribute('aria-current', 'page');
  }
  if (route.entry === '/admin/settings') await expect(page.locator('#smtpHost')).toBeVisible();
  if (route.entry === '/admin/import/setup/[proposalId]') await expect(page.getByRole('heading', { name: locale === 'en' ? 'Your confirmation is required' : 'Ihre Bestätigung ist erforderlich' })).toBeVisible();
  if (route.entry === '/editor/lifecycle/[constitutionId]') await expect(page.locator('input[name="logicalUnitIds"]').first()).toBeVisible();
  if (route.entry === '/setup') {
    await expect(page.getByRole('button', { name: locale === 'en' ? 'Finish setup and open the site' : 'Einrichtung abschließen und Website öffnen' })).toBeDisabled();
    await expect(page.getByRole('button', { name: locale === 'en' ? 'Account menu' : 'Kontomenü' })).toBeVisible();
    await expect(page.locator('.nav-primary a')).toHaveCount(0);
  }
  if (route.entry === 'import-new-structure') await expect(page.locator('#proposalFile')).toBeVisible();
  if (route.entry === 'editor-active-correction') await expect(page.getByRole('button', { name: locale === 'en' ? 'Save draft' : 'Entwurf speichern', exact: true })).toBeVisible();
}

/** Run the same axe audit only at narrow and wide review widths, retaining exact violations. */
async function auditReviewAccessibility(page: Page, route: ReviewRoute, locale: string, width: number) {
  if (width === 390 || width === 1440) {
    await page.addScriptTag({ path: axePath });
    const violations = await page.evaluate(async () => {
      // @ts-expect-error axe is injected for the audit
      return (await window.axe.run(document)).violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }));
    });
    expect(violations, `${locale} ${route.path}`).toEqual([]);
  }
}

/** Keep opt-in Linux snapshots, filtering, soft assertions, names and timeouts unchanged. */
async function captureReviewSnapshot(page: Page, route: ReviewRoute, locale: string, width: number) {
  if ('snapshot' in route && route.snapshot && process.platform === 'linux' && process.env.E2E_SKIP_VISUAL !== 'true' && (!snapshotEntries || snapshotEntries.includes(route.entry))) {
    const name = route.entry.replace(/\//g, '-').replace(/[\[\]]/g, '').replace(/^-/, '');
    await expect.soft(page).toHaveScreenshot(`review-${name}-${locale}-${width}.png`, { fullPage: true, timeout: 15_000 });
  }
}
