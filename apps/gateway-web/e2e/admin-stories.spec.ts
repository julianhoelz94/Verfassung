import { expect, test, type Page } from './fixtures/consent';
import { signInAdmin, startEditorSession, VERSION_2022 } from './helpers';

const mockOrigin = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;

async function sessionDetails(page: Page) {
  const summary = page.locator('summary').filter({ hasText: 'Session and publication' });
  if (!(await summary.evaluate(element => element.parentElement!.hasAttribute('open')))) await summary.click();
}

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${mockOrigin}/__reset`)).ok()).toBeTruthy();
});

test('administrator manages a user and its access lifecycle', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/admin/users');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('new-editor@example.local');
  const invite = page.locator('form').filter({ has: page.getByRole('button', { name: 'Send invite' }) });
  await invite.getByRole('checkbox', { name: 'Reader', exact: true }).uncheck();
  await invite.getByRole('checkbox', { name: 'Editor', exact: true }).check();
  await invite.getByRole('checkbox', { name: 'Reviewer', exact: true }).check();
  await page.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByText('E2E-INVITE-ADMIN')).toBeVisible();

  await page.reload();
  const user = page.locator('.data-row').filter({ hasText: 'new-editor@example.local' });
  await expect(user.locator('.role-badges')).toContainText('EditorReviewer');
  await expect(user).toContainText('Invited');

  const activeUser = page.locator('.data-row').filter({ hasText: 'local-admin@example.local' });
  await activeUser.getByText('Edit roles', { exact: true }).click();
  await activeUser.getByRole('checkbox', { name: 'Publisher' }).check();
  await activeUser.getByRole('button', { name: 'Update roles' }).click();
  await page.reload();
  await expect(page.locator('.data-row').filter({ hasText: 'local-admin@example.local' }).locator('.role-badges')).toContainText('Publisher');
  await page.locator('.data-row').filter({ hasText: 'local-admin@example.local' }).getByRole('button', { name: 'Issue reset token' }).click();
  await expect(page.getByText('E2E-RESET-ADMIN')).toBeVisible();
  await page.locator('.data-row').filter({ hasText: 'local-admin@example.local' }).getByRole('button', { name: 'Disable' }).click();
  let persistedUser = page.locator('.data-row').filter({ hasText: 'local-admin@example.local' });
  await expect(persistedUser).toContainText('Disabled');
  await expect(persistedUser.getByRole('button', { name: 'Activate' })).toBeVisible();
  await persistedUser.getByRole('button', { name: 'Activate' }).click();
  persistedUser = page.locator('.data-row').filter({ hasText: 'local-admin@example.local' });
  await expect(persistedUser.getByRole('button', { name: 'Disable' })).toBeVisible();
});

test('administrator creates, rotates and revokes a service token', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/admin/users');
  await page.getByLabel('Name').fill('CI integration');
  await page.getByLabel('Scopes (comma-separated)').fill('catalog:write');
  await page.getByRole('button', { name: 'Issue token' }).click();
  await expect(page.getByText('E2E-SERVICE-TOKEN')).toBeVisible();

  await page.reload();
  const token = page.locator('.data-row').filter({ hasText: 'CI integration' });
  await expect(token).toContainText('catalog:write');
  await token.getByRole('button', { name: 'Rotate' }).click();
  await expect(page.getByText('E2E-ROTATED-TOKEN')).toBeVisible();
  await page.reload();
  await page.locator('.data-row').filter({ hasText: 'CI integration' }).getByRole('button', { name: 'Revoke' }).click();
  await page.reload();
  await expect(page.locator('.data-row').filter({ hasText: 'CI integration' })).toContainText('Revoked');
});

test('administrator stages constitution JSON for review without publishing it', async ({ page }, testInfo) => {
  await signInAdmin(page);
  await page.goto('/admin/import');
  await page.getByText('Paste JSON instead', { exact: true }).click();
  await page.getByLabel('Import JSON').fill(JSON.stringify({
    isoCode: 'US',
    countryName: 'United States',
    constitutionSlug: 'constitution',
    constitutionTitle: 'Constitution',
    versionLabel: '1789',
    sourceUrl: 'https://example.org/atlas-e2e/us-1789',
    articles: [{ articleNumber: '1', title: 'Legislative power', body: 'All legislative powers.' }],
  }));
  await page.getByRole('button', { name: 'Stage for review' }).click();
  await expect(page.getByRole('heading', { name: 'Review import' })).toBeVisible();
  await expect(page.locator('.import-workflow').getByRole('status')).toContainText('Draft preparation required');
  await expect(page.getByRole('link', { name: 'Open the published version' })).toHaveCount(0);
  await page.goto('/editor?status=reviewing');
  const item = page.locator('.editor-session-list li').filter({ hasText: '1789' });
  await item.getByRole('link', { name: 'Open review' }).click();
  await expect(page).toHaveURL(/\/editor\?importJobId=/);
  await page.getByRole('button', { name: 'Prepare unpublished draft' }).click();
  await expect(page.getByRole('heading', { name: 'Prepared draft as readers will see it' })).toBeVisible();
  await page.getByLabel('Review reason').first().fill('Checked my imported text against the original source.');
  await page.getByRole('button', { name: 'Approve prepared draft' }).click();
  await expect(page.getByRole('heading', { name: 'Approved – publication pending' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Publication', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve prepared draft' })).toHaveCount(0);
  const viewport = page.viewportSize();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const status = page.getByRole('heading', { name: 'Approved – publication pending' });
    expect((await status.boundingBox())!.y).toBeLessThan(900);
    expect(await status.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    const path = testInfo.outputPath(`import-approved-${width}.png`);
    await page.screenshot({ path, fullPage: true });
    await testInfo.attach(`import-approved-${width}`, { path, contentType: 'image/png' });
  }
  if (viewport) await page.setViewportSize(viewport);
  await expect(page.getByRole('button', { name: 'Publish approved version' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Publish approved version' })).toBeVisible();
  await page.goto('/editor?status=approved');
  await page.locator('.editor-session-list li').filter({ hasText: '1789' }).getByRole('link', { name: 'Open publish view' }).click();
  await page.request.post(`${mockOrigin}/__import_publication_error`, { data: { code: 'publication_credentials_invalid' } });
  await page.getByRole('button', { name: 'Publish approved version' }).click();
  await expect(page.locator('.import-workflow').getByRole('alert')).toContainText('internal publication credential is invalid');
  await expect(page.getByRole('heading', { name: 'Approved – publication pending' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve prepared draft' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Approved – publication pending' })).toBeVisible();
  await page.request.post(`${mockOrigin}/__import_publication_error`, { data: { code: null } });
  await page.getByRole('button', { name: 'Publish approved version' }).click();
  await expect(page.getByRole('link', { name: 'Open the published version' })).toBeVisible();
  await expect(page.locator('.import-workflow').getByRole('status')).toContainText('Published');
  await expect(page.getByRole('button', { name: 'Publish approved version' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Open the published version' })).toBeVisible();
});

test('administrator creates a constitution and changes its outline settings', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/admin/constitutions');
  await page.getByLabel('Country').selectOption('DE');
  await page.getByLabel('Constitution title').fill('Test Constitution');
  await page.getByRole('button', { name: 'Continue to structure' }).click();
  await page.getByRole('button', { name: /Articles only/ }).click();
  await expect(page.getByRole('textbox', { name: 'Label' })).toHaveCount(1);
  await page.getByRole('button', { name: /Articles and sections/ }).click();
  await expect(page.getByRole('textbox', { name: 'Label' })).toHaveCount(2);
  await page.getByRole('textbox', { name: 'Label' }).nth(1).fill('Clause');
  await page.getByLabel('Allow text alongside child units').check();
  const preview = page.getByRole('complementary', { name: 'Reader preview' });
  await expect(preview.getByText('The following rights are protected.', { exact: true }).first()).toBeVisible();
  await expect(preview.getByText('These rights apply to everyone.', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Continue to review' }).click();
  await expect(page.getByRole('heading', { name: 'Review before creating' })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/constitutions$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(preview).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await expect(page).toHaveURL(/\/admin\/constitutions$/);
  await page.getByRole('button', { name: 'Create constitution' }).click();
  await expect(page).toHaveURL(/\/admin\/constitutions\/[^/?]+$/, { timeout: 30000 });
  await expect(page.getByRole('heading', { name: 'Test Constitution' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Import the first version' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Label' }).nth(1)).toHaveValue('Clause');
  await page.getByLabel('How this layer is shown').nth(1).selectOption('concatenated');
  await page.getByRole('button', { name: 'Preview change impact' }).click();
  await expect(page.getByRole('heading', { name: 'Safe to save' })).toBeVisible();
  await page.getByRole('button', { name: 'Save outline' }).click();
  await expect(page).toHaveURL(/saved=1/, { timeout: 30000 });
  await expect(page.getByText('Settings saved. Historical versions retain their structural settings.')).toBeVisible();
  await expect(page.getByLabel('How this layer is shown').nth(1)).toHaveValue('concatenated');
});

test('constitution preview explains units and shows running sentences throughout creation', async ({ page, browser }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await signInAdmin(page);
  await page.goto('/admin/constitutions');
  await page.getByLabel('Country').selectOption('DE');
  await page.getByLabel('Constitution title').fill('Example Constitution');
  await page.screenshot({ path: testInfo.outputPath('01-basics.png') });
  await page.getByRole('button', { name: 'Continue to structure' }).click();
  const preview = page.getByRole('complementary', { name: 'Reader preview' });
  await expect(preview.getByRole('heading', { name: 'Structure map' })).toHaveCount(0);
  await page.getByLabel('Allow text alongside child units').nth(1).check();
  const sentences = preview.locator('.constitution-concat').first().locator('[data-preview-kind="sentence"]');
  await expect(sentences).toHaveCount(2);
  await expect(preview.locator('.constitution-concat').first()).toHaveText('Everyone has the right to equal protection. The law shall protect these rights.');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(0, 0);
  await page.screenshot({ path: testInfo.outputPath('02-structure.png') });
  await page.screenshot({ path: testInfo.outputPath('02-structure-full.png'), fullPage: true });
  const sentence = sentences.first();
  await sentence.hover();
  await expect(preview.getByRole('tooltip')).toHaveCount(1);
  await expect(preview.getByRole('tooltip')).toContainText('Text leaf · No child units');
  await expect(preview.getByRole('tooltip')).toContainText('running text, joined with adjacent sibling units');
  await page.screenshot({ path: testInfo.outputPath('03-sentence-annotation.png') });
  await page.keyboard.press('Escape');
  await expect(preview.getByRole('tooltip')).toHaveCount(0);
  await sentence.focus();
  await expect(preview.getByRole('tooltip')).toContainText('Text leaf · No child units');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Continue to review' }).click();
  await expect(page.getByRole('heading', { name: 'Review before creating' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(0, 0);
  await page.screenshot({ path: testInfo.outputPath('04-review.png'), fullPage: true });

  const mobile = await browser.newContext({ storageState: await page.context().storageState(), hasTouch: true, viewport: { width: 320, height: 844 } });
  try {
    const phone = await mobile.newPage();
    await phone.goto(`${new URL(page.url()).origin}/admin/constitutions`);
    await phone.getByLabel('Constitution title').fill('Mobile Constitution');
    await phone.getByRole('button', { name: 'Continue to structure' }).click();
    const phonePreview = phone.getByRole('complementary', { name: 'Reader preview' });
    await phonePreview.locator('[data-preview-kind="sentence"]').first().tap();
    await expect(phonePreview.getByRole('tooltip')).toContainText('Text leaf · No child units');
    const box = await phonePreview.getByRole('tooltip').boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await phone.screenshot({ path: testInfo.outputPath('05-mobile-annotation.png') });
  } finally { await mobile.close(); }
});

test('guided creation exposes a manual catalog slug when a title cannot generate one', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/admin/constitutions');
  await page.getByLabel('Constitution title').fill('日本国憲法');
  await expect(page.getByText('Enter a catalog slug using Latin letters and numbers to continue.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Catalog slug' }).fill('japan-constitution');
  await page.getByRole('button', { name: 'Continue to structure' }).click();
  await page.getByRole('button', { name: /Articles only/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Label' })).toHaveCount(1);
});

test('guided creation sends an expired administrator session to login', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/admin/constitutions');
  await page.getByLabel('Constitution title').fill('Expired Session Example');
  await page.getByRole('button', { name: 'Continue to structure' }).click();
  await page.getByRole('button', { name: 'Continue to review' }).click();
  await page.context().clearCookies();
  await page.getByRole('button', { name: 'Create constitution' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('administrator can carry an editorial correction through every role action', async ({ page }) => {
  await signInAdmin(page);
  await startEditorSession(page, VERSION_2022, 'editorial_correction');
  await page.getByLabel('Article text').fill('Administrator correction.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await sessionDetails(page);
  await page.getByLabel('What was corrected in this transcription?').fill('Administrator fixed the transcription.');
  await page.getByRole('button', { name: 'Save comment' }).click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await page.getByRole('button', { name: 'Approve review' }).click();
  await sessionDetails(page);
  await page.getByRole('button', { name: 'Publish transcription' }).click();
  await expect(page.getByText(/Published as version/)).toBeVisible();
});

test('outline mixed-content preview follows permissions on desktop and mobile', async ({ page }, testInfo) => {
  await signInAdmin(page);
  await page.goto('/admin/constitutions/01900000-0000-4000-8000-000000000002');
  const preview = page.getByRole('complementary', { name: 'Reader preview' });
  await expect(preview.getByRole('heading', { name: 'Structure map' })).toHaveCount(0);
  await expect(preview.getByRole('heading', { name: 'Reader preview' })).toBeVisible();
  const permission = page.getByLabel('Allow text alongside child units').first();
  await permission.check();
  await expect(preview.locator('[data-preview-kind="article"] > .node-tree > p').first()).toHaveText('The following rights are protected.');
  await expect(preview.getByText('The following rights are protected.', { exact: true }).first()).toBeVisible();
  await expect(preview.getByText('These rights apply to everyone.', { exact: true }).first()).toBeVisible();
  await expect(preview.getByText('The law shall uphold these guarantees.', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('outline-desktop.png'), fullPage: true });
  await permission.uncheck();
  await expect(preview.locator('[data-preview-kind="article"] > .node-tree > p')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(preview).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('outline-mobile.png'), fullPage: true });
});

test('administrator can find both legal pages and switch their language', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/admin');
  await page.locator('main').getByRole('link', { name: 'Legal pages', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit imprint' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Legal pages', exact: true }).getByRole('link', { name: 'Privacy notice', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit privacy notice' })).toBeVisible();
  await page.getByRole('link', { name: 'English version', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/legal\/datenschutz_en$/);
  await expect(page.getByRole('navigation', { name: 'Legal pages', exact: true }).getByRole('link', { name: 'Imprint', exact: true })).toHaveAttribute('href', '/admin/legal/impressum_en');
  await page.getByRole('navigation', { name: 'Legal pages', exact: true }).getByRole('link', { name: 'Imprint', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/legal\/impressum_en$/);
  await page.getByRole('link', { name: 'German version', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/legal\/impressum$/);
});

test('administrator previews a structure proposal uploaded as a JSON file', async ({ page, request }) => {
  expect((await request.post(`${mockOrigin}/__sprint59_content`)).ok()).toBeTruthy();
  await signInAdmin(page);
  await page.goto('/admin/import');
  await page.getByRole('link', { name: /Set up a new constitution/ }).click();
  await expect(page.getByLabel('Setup proposal JSON')).toBeHidden();
  await page.getByLabel('Structure proposal file (JSON)').setInputFiles({
    name: 'structure.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      isoCode: 'DE', countryName: 'Germany', constitutionSlug: 'uploaded-proposal', constitutionTitle: 'Uploaded structure proposal',
      languageCode: 'en', sourceUrl: 'https://example.org/source', outline: { kinds: [] }, sampleRoots: [],
    })),
  });
  await page.getByRole('button', { name: 'Preview proposed structure' }).click();
  await expect(page).toHaveURL(/\/admin\/import\/setup\/[^/?]+$/);
  await expect(page.getByRole('heading', { name: 'Source and identity' })).toBeVisible();
  await expect(page.getByText('Germany (DE) · Uploaded structure proposal')).toBeVisible();
});

test('administrator saves grouped registration and mail settings', async ({ page, request }) => {
  expect((await request.post(`${mockOrigin}/__sprint59_content`)).ok()).toBeTruthy();
  await signInAdmin(page);
  await page.goto('/admin/settings');
  await page.locator('#smtpHost').fill('smtp.example.local');
  await page.getByRole('checkbox', { name: 'Allow people to register themselves' }).uncheck();
  await page.getByRole('button', { name: 'Save registration and mail settings' }).click();
  await expect(page.getByText('Settings saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('#smtpHost')).toHaveValue('smtp.example.local');
  await expect(page.getByRole('checkbox', { name: 'Allow people to register themselves' })).not.toBeChecked();
});
