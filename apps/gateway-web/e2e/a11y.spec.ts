/* eslint-disable */
import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { signInAdmin, signInEditor, signOut } from './helpers';

const axePath = path.join(process.cwd(), 'node_modules/axe-core/axe.min.js');

async function expectNoAxeViolations(page: Page): Promise<void> {
  await expect(page.locator('h1').first()).toBeVisible();
  await page.addScriptTag({ path: axePath });
  const results = await page.evaluate(async () => {
    // @ts-expect-error axe is injected onto window
    return window.axe.run(document);
  });
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

test('axe passes on public and editor routes', async ({ page }) => {
  await expect(async () => {
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible();
  }).toPass({ timeout: 10_000 });
  await expectNoAxeViolations(page);

  await page.goto('/search');
  await expectNoAxeViolations(page);

  await page.goto('/login');
  await expectNoAxeViolations(page);

  await page.goto('/about');
  await expectNoAxeViolations(page);

  await page.goto('/countries/DE/versions/01900000-0000-4000-8000-000000000004');
  await expectNoAxeViolations(page);

  await page.goto(
    '/countries/DE/versions/01900000-0000-4000-8000-000000000004/articles/01900000-0000-4000-8000-000000000201',
  );
  await expectNoAxeViolations(page);

  await page.goto('/countries/DE/articles/1');
  await expectNoAxeViolations(page);

  await page.goto('/countries/DE/compare');
  await expectNoAxeViolations(page);

  await signInEditor(page);
  await expectNoAxeViolations(page);

  await page.goto('/editor/amendments');
  await expect(page.getByRole('heading', { name: 'Amending laws' })).toBeVisible();
  await expectNoAxeViolations(page);

  await signOut(page);
  await signInAdmin(page);
  await page.goto('/admin/users');
  await expectNoAxeViolations(page);
});
