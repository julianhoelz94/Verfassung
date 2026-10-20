import { test, expect } from './fixtures/consent';
import { signInAdmin } from './helpers';

const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;

for (const locale of ['en', 'de'])
  test(`settings templates share a single responsive spacing owner in ${locale}`, async ({ page, request }) => {
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
        await expect(page.locator('main')).toHaveAttribute('data-template', 'settings');
        await expect(page.locator('main')).toHaveCount(1);
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
  });
