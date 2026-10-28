import { test, expect } from './fixtures/consent';
import { signInEditor, VERSION_1949 } from './helpers';

const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
const owner = '01900000-0000-4000-8000-000000000410';
const draftId = '01900000-0000-4000-8000-000000008001';
const publishedId = '01900000-0000-4000-8000-000000008002';

test.beforeEach(async ({ request }) => { await request.post(`${mock}/__reset`); });

for (const width of [390, 820, 1440]) {
  test(`filter, archive, restore, and delete own work at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 1000 });
    await request.post(`${mock}/__editor_sessions`, { data: { sessions: [
      { id: draftId, status: 'open' }, { id: publishedId, status: 'published' },
    ].map(session => ({ ...session, versionId: VERSION_1949, openedBy: owner,
      openedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', changedArticleCount: 0, hopKind: 'editorial_correction' })) } });
    await signInEditor(page);
    await expect(page.locator('.editor-session-list li')).toHaveCount(2);
    await page.screenshot({ path: test.info().outputPath('work-layout.png'), fullPage: true });
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('published');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.locator('.editor-session-list li')).toHaveCount(1);
    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(page.locator('.editor-session-list li')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.editor-session-list li')).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Show', exact: true }).selectOption('true');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.locator('.editor-session-list li')).toHaveCount(1);
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(page.locator('.editor-session-list li')).toHaveCount(0);
    await page.goto('/editor?mine=1&workStatus=open');
    await expect(page.locator('.editor-session-list li')).toHaveCount(1);
    await page.getByText('Delete draft', { exact: true }).click();
    await expect(page.getByText('This removes the draft', { exact: false })).toBeVisible();
    await expect(page.locator('.editor-session-list li')).toHaveCount(1);
    await page.getByRole('button', { name: 'Confirm deletion', exact: true }).click();
    await expect(page.locator('.editor-session-list li')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.editor-session-list li')).toHaveCount(0);
    await page.goto('/editor?mine=1');
    await expect(page.locator('.editor-session-list li')).toHaveCount(1);
    await expect(page.getByText('Delete draft', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`MFA actions have a gap above the passkey at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/login');
    await page.getByLabel('Email').fill('local-editor@example.local');
    await page.getByLabel('Password').fill('change-me');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    for (const recovery of [false, true]) {
      await expect(page.getByLabel(recovery ? 'Recovery code' : 'Authenticator code', { exact: true })).toBeVisible();
      const form = await page.locator('.mfa-form').boundingBox();
      const passkey = await page.getByRole('button', { name: 'Use a passkey', exact: true }).boundingBox();
      expect(passkey!.y - form!.y - form!.height).toBeGreaterThanOrEqual(12);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(recovery ? 'mfa-recovery.png' : 'mfa-code.png'), fullPage: true });
      if (!recovery) await page.getByRole('link', { name: 'Use a recovery code', exact: true }).click();
    }
  });
}

test('imports use shared disclosures and completed imports can be archived and restored', async ({ page, request }) => {
  await signInEditor(page);
  const response = await request.post(`${mock}/api/ingestion/import-jobs`, { data: {
    isoCode: 'DE', countryName: 'Germany', constitutionSlug: 'gg', constitutionTitle: 'Basic Law', versionLabel: 'Archive example',
    articles: [{ articleNumber: '1', title: 'Human dignity', body: 'Human dignity shall be inviolable.' }],
  } });
  const job = await response.json();
  await request.post(`${mock}/api/ingestion/import-jobs/${job.id}/prepare`);
  await request.post(`${mock}/api/ingestion/import-jobs/${job.id}/publish`);
  await page.goto(`/editor?importJobId=${job.id}`);
  const technical = page.locator('details.disclosure').filter({ has: page.locator('summary', { hasText: 'Technical details' }) });
  const submitted = page.locator('#import-structure.disclosure');
  await expect(technical).toHaveCount(1);
  await expect(submitted).toHaveCount(1);
  for (const disclosure of [technical, submitted]) {
    await expect(disclosure).not.toHaveAttribute('open', '');
    await disclosure.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(disclosure).toHaveAttribute('open', '');
  }
  await page.goto('/editor?mine=1&workStatus=published');
  await expect(page.getByText('Archive example', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByText('Archive example', { exact: true })).toHaveCount(0);
  await page.goto('/editor?mine=1&archived=true&workStatus=published');
  await expect(page.getByText('Archive example', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByText('Archive example', { exact: true })).toHaveCount(0);
  await page.goto('/editor?mine=1&workStatus=published');
  await expect(page.getByText('Archive example', { exact: true })).toBeVisible();
});
