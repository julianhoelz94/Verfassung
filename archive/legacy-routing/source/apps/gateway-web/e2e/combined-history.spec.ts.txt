import { test, expect } from './fixtures/consent';

const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${mock}/__reset`)).ok()).toBeTruthy();
  expect((await request.post(`${mock}/__sprint50_content`)).ok()).toBeTruthy();
});

test('one chronology interleaves lifecycle and amendment events and filters without losing date context', async ({ page }) => {
  await page.goto('/countries/DE/timeline?on=1949-05-10');
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await expect(page.locator('.history-details > li')).toHaveCount(3);
  expect(await page.locator('.history-details > li').evaluateAll(nodes => nodes.map(node => [node.getAttribute('data-kind'), node.getAttribute('data-date')]))).toEqual([
    ['constitution', '1949-05-08'], ['constitution', '1949-05-23'], ['amendment', '2022-12-19'],
  ]);
  await page.locator('#history-event-type').selectOption('amendment');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page).toHaveURL(/on=1949-05-10&events=amendment$/);
  await expect(page.locator('.history-details > li')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Update to Article 1', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Official change document' })).toHaveAttribute('href', 'https://example.gov/update-article-1.pdf');
  await page.locator('#history-event-type').selectOption('constitution');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.history-details > li')).toHaveCount(2);
  await page.getByLabel('Date', { exact: true }).fill('1949-05-20');
  await page.getByRole('button', { name: 'Show status' }).click();
  await expect(page.locator('#history-event-type')).toHaveValue('constitution');
  await page.locator('#history-event-type').selectOption('all');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.history-details > li')).toHaveCount(3);
});

test('old constitution timeline links retain date and selected event in the unified history', async ({ page }) => {
  const fragment = '#history-event-01900000-0000-4000-8000-000000000732';
  await page.goto(`/countries/DE/constitution-timeline?on=1949-05-10${fragment}`);
  await expect(page).toHaveURL(`/countries/DE/timeline?on=1949-05-10${fragment}`);
  await expect(page.locator('#constitution-timeline-date')).toHaveValue('1949-05-10');
  await expect(page.locator('[data-event-index="1"]')).toHaveAttribute('aria-pressed', 'true');
});

test('an unavailable history source leaves the other events visible and flags the incomplete chronology', async ({ page, request }) => {
  await request.post(`${mock}/__history_unavailable`, { data: { amendments: true } });
  await page.goto('/countries/DE/timeline');
  await expect(page.locator('main').getByRole('alert')).toContainText('Amendments could not be loaded');
  await expect(page.locator('.history-details > li')).toHaveCount(2);
  await request.post(`${mock}/__history_unavailable`, { data: { amendments: false, lifecycle: true } });
  await page.reload();
  await expect(page.locator('main').getByRole('alert')).toContainText('Constitution events could not be loaded');
  await expect(page.locator('.history-details > li')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Update to Article 1', exact: true })).toBeVisible();
});

test('history keeps its not-found response and other routes ignore a supplied internal history header', async ({ page, request }) => {
  const response = await page.goto('/countries/ZZ/timeline');
  expect(response?.status()).toBe(404);
  const about = await request.get('/about', { headers: { 'x-history-route': '/countries/ZZ/timeline' } });
  expect(about.ok()).toBeTruthy();
  expect(await about.text()).toContain('About');
});

test('markers sit on a centered line and reveal their labels on hover and keyboard focus', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/countries/DE/timeline?on=2026-01-01');
  const markers = page.locator('.history-milestone');
  const tooltip = page.getByRole('tooltip');
  await expect(markers).toHaveCount(3);
  await expect(tooltip).toHaveCount(0);
  const geometry = await page.locator('.history-years').evaluate(list => {
    const bounds = list.getBoundingClientRect();
    const container = list.parentElement!.getBoundingClientRect();
    const line = getComputedStyle(list, '::before');
    const lineCenter = bounds.top + parseFloat(line.top) + parseFloat(line.height) / 2;
    return { centerOffset: (bounds.left + bounds.width / 2) - (container.left + container.width / 2),
      markerOffsets: [...list.querySelectorAll('.history-marker')].map(marker => {
        const rect = marker.getBoundingClientRect();
        return rect.top + rect.height / 2 - lineCenter;
      }) };
  });
  expect(Math.abs(geometry.centerOffset)).toBeLessThan(1);
  for (const offset of geometry.markerOffsets) expect(Math.abs(offset)).toBeLessThan(1);
  await page.screenshot({ path: testInfo.outputPath('timeline-centered.png'), fullPage: true });
  await markers.first().hover();
  await expect(tooltip).toContainText('Adopted');
  await expect(tooltip).toContainText('Circa 1949-05-08');
  await tooltip.hover();
  await page.waitForTimeout(200);
  await expect(tooltip).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('timeline-hover.png'), fullPage: false });
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await markers.first().hover();
  await expect(tooltip).toBeVisible();
  await page.getByRole('heading', { name: 'History', exact: true }).hover();
  await expect(tooltip).toHaveCount(0);
  await page.locator('.history-rail').focus();
  await page.keyboard.press('Tab');
  await expect(markers.first()).toBeFocused();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(markers.nth(1)).toBeFocused();
  await expect(markers.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(tooltip).toContainText('Entered into force');
});

test('touch users select markers to read details without relying on hover', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 390, height: 844 }, hasTouch: true });
  await context.addInitScript(() => localStorage.setItem('ca_cookie_notice_v1', 'dismissed'));
  try {
    const page = await context.newPage();
    await page.goto('/countries/DE/timeline?on=2026-01-01');
    await page.locator('.history-milestone').last().tap();
    await expect(page.getByRole('heading', { name: 'Update to Article 1', exact: true })).toBeVisible();
    await expect(page.locator('.history-details > li:visible')).toHaveCount(1);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  } finally { await context.close(); }
});

test('repeated history parameters retain the first value and a complete no-JavaScript response', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('/countries/DE/timeline?events=constitution&events=amendment&on=1949-05-10&on=2026-01-01');
    await expect(page.locator('.history-details > li:visible')).toHaveCount(2);
    await expect(page.locator('#history-event-type')).toHaveValue('constitution');
    await expect(page.locator('#constitution-timeline-date')).toHaveValue('1949-05-10');
  } finally { await context.close(); }
});
