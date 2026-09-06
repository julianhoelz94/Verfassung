/* eslint-disable */
import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { signInEditor } from './helpers';

const axePath = path.join(process.cwd(), 'node_modules/axe-core/axe.min.js');

async function expectNoAxeViolations(page: Page): Promise<void> {
  await page.addScriptTag({ path: axePath });
  const results = await page.evaluate(async () => {
    // @ts-expect-error axe is injected onto window
    return window.axe.run(document, { rules: { 'color-contrast': { enabled: false } } });
  });
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

test('axe passes on public and editor routes', async ({ page }) => {
  await page.goto('/');
  await expectNoAxeViolations(page);

  await page.goto('/search');
  await expectNoAxeViolations(page);

  await page.goto('/login');
  await expectNoAxeViolations(page);

  await page.goto('/countries/DE/versions/01900000-0000-4000-8000-000000000004');
  await expectNoAxeViolations(page);

  await page.goto(
    '/countries/DE/versions/01900000-0000-4000-8000-000000000004/articles/01900000-0000-4000-8000-000000000201',
  );
  await expectNoAxeViolations(page);

  await page.goto('/countries/DE/compare');
  await expectNoAxeViolations(page);

  await signInEditor(page);
  await expectNoAxeViolations(page);
});
