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
