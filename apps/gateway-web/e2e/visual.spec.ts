/* eslint-disable */
import { test, expect, type Page } from '@playwright/test';
import { signInEditor } from './helpers';

const NARROW = { width: 390, height: 844 };
const WIDE = { width: 1280, height: 800 };

async function snapshot(page: Page, name: string): Promise<void> {
  await expect(page).toHaveScreenshot(name, { fullPage: true });
}

test('public and editor layouts at narrow and wide viewports', async ({ page }) => {
  test.skip(process.platform !== 'linux', 'Visual snapshots are Linux Chromium (Playwright Docker / CI).');
  for (const viewport of [
    { size: NARROW, suffix: 'narrow' },
    { size: WIDE, suffix: 'wide' },
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
  await page.setViewportSize(NARROW);
  await snapshot(page, 'editor-narrow.png');
  await page.setViewportSize(WIDE);
  await snapshot(page, 'editor-wide.png');
});
