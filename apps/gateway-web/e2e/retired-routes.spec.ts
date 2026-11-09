import { test, expect } from './fixtures/consent';
import { signInReviewer } from './helpers';

const version = '01900000-0000-4000-8000-000000000001';

test('retired pre-launch URLs return not found instead of redirecting or serving archived code', async ({ request }) => {
  const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
  expect((await request.post(`${mock}/__reset`)).ok()).toBeTruthy();
  for (const path of [
    '/legacy',
    '/countries/DE/constitution-timeline?on=1949-05-23',
    `/admin/import/${version}`,
    `/versions/${version}/units/${version}`,
    '/archive/legacy-routing/source/apps/gateway-web/app/legacy/page.tsx.txt',
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
    expect(response.headers().location, path).toBeUndefined();
  }
});

test('an MCP import opens its prepared text and review decision in the shared editor workspace', async ({ page, request }) => {
  const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
  expect((await request.post(`${mock}/__reset`)).ok()).toBeTruthy();
  expect((await request.post(`${mock}/__sprint59_content`)).ok()).toBeTruthy();
  expect((await request.post(`${mock}/__sprint59_import`, { data: { prepared: true } })).ok()).toBeTruthy();
  await signInReviewer(page);
  await page.goto('/editor?importJobId=01900000-0000-4000-8000-000000000701');
  await expect(page.locator('.import-review')).toBeVisible();
  await expect(page.locator('.nav-primary').getByRole('link', { name: 'Imports', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.nav-primary').getByRole('link', { name: 'Editor', exact: true })).not.toHaveAttribute('aria-current', 'page');
  await page.getByRole('tab', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve prepared draft', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish approved version', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/editor\?importJobId=/);
});
