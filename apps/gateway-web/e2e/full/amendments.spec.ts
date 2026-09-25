import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { signIn, signOut } from './auth';

const ids = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'generated', '.runtime', 'prepopulate-ids.json'), 'utf8')) as {
  amendments: Record<string, string>;
};

test('editor restores a real change-record revision and publisher republishes it', async ({ page }) => {
  test.setTimeout(120_000);
  const amendmentId = ids.amendments['xa-2022-law'];
  await signIn(page, 'editor');
  await page.goto(`/editor/amendments/${amendmentId}`);
  const history = page.getByRole('complementary', { name: 'Revision history' });
  await expect(history.locator('button.revision-item')).toHaveCount(2);
  await history.locator('button.revision-item').first().click();
  await expect(page.getByText('Viewing a past revision read-only.')).toBeVisible();
  await history.getByRole('button', { name: 'Restore as new draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Atlas Testland Civic Revision 2022');
  await signOut(page);

  await signIn(page, 'publisher');
  await page.goto(`/editor/amendments/${amendmentId}`);
  await page.getByRole('button', { name: 'Publish law' }).click();
  await expect(page.getByText('Amending law published.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Revision history' }).locator('button.revision-item')).toHaveCount(3);
});

test('publisher withdraws an incorrect real legal-change record', async ({ page }) => {
  const amendmentId = ids.amendments['xb-2023-law'];
  await signIn(page, 'publisher');
  await page.goto(`/editor/amendments/${amendmentId}`);
  await page.getByRole('button', { name: 'Withdraw' }).click();
  await expect(page.getByText('Amending law withdrawn.')).toBeVisible();
  await signOut(page);
  await page.goto('/countries/XB/timeline');
  await expect(page.getByText('Atlas Sample Civic Revision 2023')).toHaveCount(0);
});
