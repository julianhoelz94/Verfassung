/* eslint-disable */
import { test, expect, type Page } from '@playwright/test';
import { signInEditor } from './helpers';

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };
const DESKTOP = { width: 1440, height: 900 };

async function snapshot(page: Page, name: string): Promise<void> {
  await expect(page).toHaveScreenshot(name, { fullPage: true });
}

test('public and editor layouts at 390, 820 and 1440', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(
    process.platform !== 'linux',
    'Visual snapshots are Linux Chromium (Playwright Docker / CI). Re-baseline with mcr.microsoft.com/playwright:v1.51.1-jammy.',
  );
  for (const viewport of [
    { size: PHONE, suffix: 'narrow' },
    { size: TABLET, suffix: 'tablet' },
    { size: DESKTOP, suffix: 'wide' },
  ]) {
    await page.setViewportSize(viewport.size);

    await page.goto('/');
    await snapshot(page, `home-${viewport.suffix}.png`);

    await page.goto(
      '/countries/DE/versions/01900000-0000-4000-8000-000000000004/articles/01900000-0000-4000-8000-000000000201',
    );
    await snapshot(page, `article-${viewport.suffix}.png`);

    await page.goto('/countries/DE/compare');
    await snapshot(page, `compare-${viewport.suffix}.png`);
  }

  await signInEditor(page);
  await page.setViewportSize(PHONE);
  await snapshot(page, 'editor-narrow.png');
  await page.setViewportSize(TABLET);
  await snapshot(page, 'editor-tablet.png');
  await page.setViewportSize(DESKTOP);
  await snapshot(page, 'editor-wide.png');
});
