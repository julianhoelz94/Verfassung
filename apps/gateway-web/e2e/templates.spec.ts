import { test, expect } from './fixtures/consent';
import { signInAdmin } from './helpers';
import type { Locator } from '@playwright/test';

const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;

async function expectTypography(element: Locator, properties: Record<string, string>) {
  await expect(element).toBeVisible();
  const result = await element.evaluate((node, properties) => {
    const probe = document.createElement('span');
    for (const [property, value] of Object.entries(properties)) probe.style.setProperty(property, value);
    document.body.append(probe);
    const actual = getComputedStyle(node);
    const expected = getComputedStyle(probe);
    const result = {
      actual: Object.fromEntries(
        Object.keys(properties).map((property) => [property, actual.getPropertyValue(property)]),
      ),
      expected: Object.fromEntries(
        Object.keys(properties).map((property) => [property, expected.getPropertyValue(property)]),
      ),
    };
    probe.remove();
    return result;
  }, properties);
  expect(result.actual).toEqual(result.expected);
}

for (const locale of ['en', 'de'])
  test(`settings templates share a single responsive spacing owner in ${locale}`, async ({
    page,
    request,
    browser,
  }) => {
    test.setTimeout(120_000);
    await request.post(`${mock}/__reset`);
    await request.post(`${mock}/__sprint59_content`);
    await signInAdmin(page);
    await page.setExtraHTTPHeaders({ 'Accept-Language': locale });
    for (const width of [320, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of [
        { path: '/account', first: '#preferences' },
        { path: '/admin/settings', first: '#general' },
        { path: '/setup', first: '#connection' },
      ]) {
        if (route.path === '/setup') await request.post(`${mock}/__sprint59_setup`, { data: { completed: false } });
        await page.goto(route.path);
        await expect(page.locator('main[data-template="settings"]')).toBeVisible();
        await expect(page.locator('main')).toHaveCount(1);
        await expect(page.locator('main')).toHaveAttribute('data-template', 'settings');
        await expect(page.locator('h1')).toHaveCount(1);
        const first = page.locator(route.first);
        const parent = first.locator('..');
        await expect(first).toBeVisible();
        // A different token must produce exactly that gap, even when the children are cards or section wrappers.
        await page.addStyleTag({ content: ':root { --gap-card: 40px; }' });
        const gaps = await parent.evaluate((element) => {
          const children = [...element.children].filter((child) => getComputedStyle(child).display !== 'none');
          return children
            .slice(1)
            .map((child, i) => child.getBoundingClientRect().top - children[i].getBoundingClientRect().bottom);
        });
        expect(gaps.length).toBeGreaterThan(0);
        for (const gap of gaps) expect(gap).toBeCloseTo(40, 0);
        const edges = await parent.evaluate((element) =>
          [...element.children]
            .filter((child) => getComputedStyle(child).display !== 'none')
            .map((child) => ({ left: child.getBoundingClientRect().left, right: child.getBoundingClientRect().right })),
        );
        for (const edge of edges) {
          expect(edge.left).toBeCloseTo(edges[0].left, 0);
          expect(edge.right).toBeCloseTo(edges[0].right, 0);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        if (route.path === '/setup') await request.post(`${mock}/__sprint59_setup`, { data: { completed: true } });
      }
      await page.goto('/admin/settings');
      await page.locator('#mailFrom').evaluate((input) => {
        const label = input.closest('.field')?.querySelector('label');
        if (label)
          label.textContent =
            'Absenderadresse für Nachrichten und Benachrichtigungen mit einem besonders langen Feldnamen';
      });
      const controls = await page.locator('.form-grid input').evaluateAll((inputs) =>
        inputs.map((input) => {
          const rect = input.getBoundingClientRect();
          const label = input.closest('.field')?.querySelector('label')?.getBoundingClientRect();
          return { x: rect.x, right: rect.right, y: rect.y, labelX: label?.x };
        }),
      );
      expect(controls.length).toBeGreaterThan(2);
      for (const control of controls) expect(control.x).toBeCloseTo(control.labelX!, 0);
      if (width >= 640) {
        for (let i = 0; i + 1 < controls.length; i += 2) expect(controls[i].y).toBeCloseTo(controls[i + 1].y, 0);
      } else {
        for (const control of controls) {
          expect(control.x).toBeCloseTo(controls[0].x, 0);
          expect(control.right).toBeCloseTo(controls[0].right, 0);
        }
      }
    }
    await page.goto('/account');
    await expect(page.locator('#passkey-password')).toBeVisible();
    const passkeyGap = await page.locator('#passkey-password').evaluate((input) => {
      const field = input.closest('.field')!;
      return field.getBoundingClientRect().top - field.previousElementSibling!.getBoundingClientRect().bottom;
    });
    expect(passkeyGap).toBeCloseTo(16, 0);
    await page.goto('/admin/constitutions/01900000-0000-4000-8000-000000000002');
    await expect(page.locator('select[name="label-policy-0"]')).toBeVisible();
    const outlineGap = await page.locator('select[name="label-policy-0"]').evaluate((input) => {
      const field = input.closest('.field')!;
      return field.getBoundingClientRect().top - field.previousElementSibling!.getBoundingClientRect().bottom;
    });
    expect(outlineGap).toBeCloseTo(16, 0);
    await page.goto('/countries/DE/articles/1');
    const links = await page
      .locator('main a.btn')
      .evaluateAll((anchors) =>
        anchors
          .filter((anchor) => getComputedStyle(anchor.parentElement!).flexDirection === 'column')
          .map((anchor) => getComputedStyle(anchor).alignSelf),
      );
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((alignment) => alignment === 'flex-start')).toBe(true);
    await page.goto('/');
    await expectTypography(page.locator('.hero .page-title'), { 'font-size': 'var(--text-3xl)' });
    await request.post(`${mock}/api/editor/edit-sessions`, {
      data: {
        versionId: '01900000-0000-4000-8000-000000000804',
        hopKind: 'editorial_correction',
      },
    });
    await page.goto(
      '/editor?sessionId=01900000-0000-4000-8000-000000000501&versionId=01900000-0000-4000-8000-000000000804',
    );
    await expectTypography(page.locator('textarea.constitution-body'), {
      'font-family': 'var(--font-text)',
      'font-size': 'var(--text-md)',
      'line-height': 'var(--leading-reading)',
    });
    await request.post(`${mock}/api/identity/login`, {
      data: { email: 'local-admin@example.local', password: 'change-me' },
    });
    const origin = new URL(page.url()).origin;
    const challenged = await browser.newContext({ baseURL: origin, locale });
    try {
      await challenged.addCookies([{ name: 'ca_mfa_challenge', value: 'e2e-mfa-challenge', url: origin }]);
      const mfa = await challenged.newPage();
      await mfa.goto('/login/mfa');
      await expectTypography(mfa.locator('.mfa-form input[name="code"]'), { 'font-size': 'var(--text-xl)' });
    } finally {
      await challenged.close();
    }
  });
