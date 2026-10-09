/* eslint-disable */
import { test, expect } from '@playwright/test';
import { ARTICLE_1, VERSION_1949, VERSION_2022, signInEditor, signInPublisher, signInReviewer, signOut, startEditorSession } from './helpers';

const MOCK_ORIGIN = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;

test.beforeEach(async ({ request }) => {
  const response = await request.post(`${MOCK_ORIGIN}/__reset`);
  expect(response.ok()).toBeTruthy();
});

test('browse from countries to an article', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Countries' })).toBeVisible();
  await page.getByRole('link', { name: 'Germany' }).click();
  await expect(page.getByRole('heading', { name: 'Germany', exact: true })).toBeVisible();
  await page.getByRole('link', { name: /2022/ }).click();
  await expect(page.getByRole('heading', { name: /Version in force since/ })).toBeVisible();
  await page.getByRole('link', { name: 'Permalink' }).first().click();
  await expect(page.getByRole('heading', { name: /Human dignity/ })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/countries/DE/versions/${VERSION_2022}/articles/${ARTICLE_1}`));
  await expect(page.getByRole('link', { name: 'History of Article 1' })).toBeVisible();
  await page.getByRole('link', { name: 'History of Article 1' }).click();
  await expect(page.getByRole('heading', { name: 'History of Article 1' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Compare with previous' })).toBeVisible();
});

test('search finds a published article', async ({ page }) => {
  await page.goto('/search');
  await page.getByLabel('Keyword').fill('dignity');
  await page.locator('main').getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('link', { name: /Article 1 — Human dignity/ })).toBeVisible();
});

test('linear compare shows a structured change', async ({ page }) => {
  await page.goto('/countries/DE');
  await page.getByRole('button', { name: 'Compare' }).click();
  await expect(page.getByRole('heading', { name: /side by side/ })).toBeVisible();
  await expect(page.locator('.compare-article h2 .badge').first()).toHaveText('Changed');
  await expect(page.locator('ins.diff-add, del.diff-remove').first()).toBeVisible();
});

test('login with MFA then logout', async ({ page }) => {
  await signInEditor(page);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByText('local-editor@example.local', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
});

test('editor landing lists every owned open session and keeps creation on the viewer', async ({ page, request }) => {
  const sessions = Array.from({ length: 101 }, (_, index) => ({
    id: `01900000-0000-4000-8000-${String(index + 1000).padStart(12, '0')}`,
    versionId: VERSION_1949,
    status: 'open',
    openedBy: '01900000-0000-4000-8000-000000000410',
    openedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    changedArticleCount: 0,
    hopKind: 'editorial_correction',
  }));
  await request.post(`${MOCK_ORIGIN}/__editor_sessions`, { data: { sessions } });
  await signInEditor(page);
  await expect(page.getByRole('heading', { name: 'My open sessions' })).toBeVisible();
  await expect(page.locator('.editor-session-list li')).toHaveCount(101);
  await expect(page.getByRole('heading', { name: 'Germany', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Basic Law for the Federal Republic of Germany' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Correct this text' })).toHaveCount(0);
  await page.goto(`/countries/DE/versions/${VERSION_1949}`);
  await page.getByRole('link', { name: 'Edit this constitution' }).click();
  await expect(page.locator('#editor-entry').getByRole('link', { name: 'Continue your open session' })).toBeVisible();
  await expect(page.locator('#editor-entry').getByRole('button', { name: 'Correct this text' })).toHaveCount(0);
});

test('viewer explains when session lookup is unavailable', async ({ page, request }) => {
  await request.post(`${MOCK_ORIGIN}/__editor_sessions`, { data: { unavailable: true } });
  await signInEditor(page);
  await page.goto(`/countries/DE/versions/${VERSION_2022}`);
  await page.getByRole('link', { name: 'Edit this constitution' }).click();
  await expect(page.getByText('Edit sessions are temporarily unavailable. Try again before starting a new session.')).toBeVisible();
  await expect(page.locator('#editor-entry').getByRole('button', { name: 'Correct this text' })).toHaveCount(0);
});

test('viewer shows one matching session and ignores another constitution', async ({ page, request }) => {
  const session = (id: string, versionId: string) => ({
    id, versionId, status: 'open', openedBy: '01900000-0000-4000-8000-000000000410',
    openedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
    changedArticleCount: 0, hopKind: 'editorial_correction',
  });
  await request.post(`${MOCK_ORIGIN}/__editor_sessions`, { data: { sessions: [
    session('01900000-0000-4000-8000-000000001001', VERSION_2022),
    session('01900000-0000-4000-8000-000000001002', '01900000-0000-4000-8000-000000009999'),
  ] } });
  await signInEditor(page);
  await page.goto(`/countries/DE/versions/${VERSION_2022}`);
  await page.getByRole('link', { name: 'Edit this constitution' }).click();
  await expect(page.locator('#editor-entry .editor-entry-list li')).toHaveCount(1);
  await expect(page.locator('#editor-entry').getByRole('link', { name: 'Continue your open session' })).toHaveAttribute('href', /001001/);
  await expect(page.locator('#editor-entry').getByRole('button', { name: 'Correct this text' })).toHaveCount(0);
  await expect(page.locator('#editor-entry').getByText('Edit sessions are temporarily unavailable.')).toHaveCount(0);
});

test('edit, review, and publish a draft', async ({ page }) => {
  await signInEditor(page);
  await startEditorSession(page, VERSION_2022, 'editorial_correction');
  await expect(page).toHaveURL(/sessionId=/);
  await expect(page.getByRole('heading', { name: 'Articles' })).toBeVisible();
  await page.getByLabel('Filter articles').fill('dignity');
  await expect(page.getByRole('link', { name: /Art\. 1 Human dignity/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Art\. 2/ })).toHaveCount(0);
  await page.getByLabel('Filter articles').fill('');
  await expect(page.getByRole('link', { name: 'Discard changes' })).toBeVisible();
  await expect(page.getByText('Preview', { exact: true })).toBeVisible();
  await expect(page.getByText('Section titles', { exact: true })).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill('Human dignity (draft)');
  await page.getByLabel('Article text').fill('Draft body for the e2e journey.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page).toHaveURL(/saved=1/);
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await expect(page.getByLabel('Session').getByText('Draft body for the e2e journey.')).toBeVisible();
  await expect(page.locator('.badge', { hasText: 'draft' })).toBeVisible();
  await page.getByLabel('What was corrected in this transcription?').fill('Corrected text.');
  await page.getByRole('button', { name: 'Save comment' }).click();
  await expect(page).toHaveURL(/detailsSaved=1/);
  await expect(page.getByText('Publish details saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page).toHaveURL(/reviewed=1/);
  await expect(page.getByText('Submitted for review.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve review' })).toHaveCount(0);
  await signOut(page);
  await signInReviewer(page);
  await page.goto('/editor?status=reviewing');
  await expect(page.getByRole('heading', { name: 'Review queue' })).toBeVisible();
  await page.locator('.editor-session-list').getByRole('link').first().click();
  await expect(page).toHaveURL(/sessionId=/);
  await expect(page.getByText('Preview', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Article 1').getByText('Draft body for the e2e journey.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'View public page' })).toBeVisible();
  const reviewerSessionUrl = page.url();
  await page.goto('/editor/amendments');
  await expect(page.getByRole('heading', { name: 'Legal changes' })).toBeVisible();
  await page.goto('/editor/history');
  await expect(page.getByRole('heading', { name: 'Snapshot history' })).toBeVisible();
  await page.goto(reviewerSessionUrl);
  await page.getByRole('button', { name: 'Approve review' }).click();
  await expect(page).toHaveURL(/approved=1/);
  await expect(page.getByText('Review approved.')).toBeVisible();
  await signOut(page);
  await signInPublisher(page);
  await page.goto('/editor?status=approved');
  await expect(page.getByRole('heading', { name: 'Ready to publish' })).toBeVisible();
  await page.locator('.editor-session-list').getByRole('link').first().click();
  await expect(page).toHaveURL(/sessionId=/);
  await page.getByRole('button', { name: 'Publish transcription' }).click();
  await expect(page.getByText('Published as version 2022-1.')).toBeVisible();
  await expect(page.getByText('ready', { exact: true })).toBeVisible();
});

test('recorded amending law appears on the public timeline', async ({ page }) => {
  await signInEditor(page);
  await page.goto('/editor/amendments');
  await page.getByRole('link', { name: 'Add legal change' }).click();
  await page.getByLabel('Title', { exact: true }).fill('E2E amending law');
  await page.getByLabel('Citation').fill('Federal Gazette 2026 I No. 1');
  await page.getByLabel('Enacted date').fill('2026-01-02');
  await page.getByLabel('Effective date').fill('2026-02-01');
  await page.getByLabel('Summary').fill('Updates the dignity provision.');
  await page.getByLabel('Comment', { exact: true }).fill('Recorded for the timeline journey.');
  await page.getByLabel('Source version (optional)').selectOption(VERSION_1949);
  await page.getByLabel('Target version (optional)').selectOption(VERSION_2022);
  await page.getByRole('button', { name: 'Fill from two versions' }).click();
  await page.getByRole('button', { name: 'Suggest changes' }).click();
  await expect(page.locator('#change-article-0')).not.toHaveValue('');
  const beforeUnit = page.getByLabel('Before unit');
  const afterUnit = page.getByLabel('After unit');
  await expect(beforeUnit.locator('option')).not.toHaveCount(1);
  await expect(afterUnit.locator('option')).not.toHaveCount(1);
  await beforeUnit.selectOption({ index: 1 });
  await afterUnit.selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();
  const amendmentUrl = page.url();
  await signOut(page);
  await signInPublisher(page);
  await page.goto(amendmentUrl);
  await page.getByRole('button', { name: 'Publish law' }).click();
  await expect(page).toHaveURL(/published=1/);
  await expect(page.getByText('Amending law published.')).toBeVisible();
  await signOut(page);
  await page.goto('/countries/DE/timeline');
  await expect(page.getByRole('heading', { name: 'Amendment timeline' })).toBeVisible();
  await expect(page.getByText('E2E amending law')).toBeVisible();
  await expect(page.getByRole('link', { name: /Before unit/ })).toHaveAttribute('href', new RegExp(`/versions/${VERSION_1949}/units/`));
  await expect(page.getByRole('link', { name: /After unit/ })).toHaveAttribute('href', new RegExp(`/versions/${VERSION_2022}/units/`));
});

test('publisher confirms stale old-law quotes without changing the public comment', async ({ page }) => {
  await signInEditor(page);
  await startEditorSession(page, VERSION_1949, 'editorial_correction');
  await expect(page).toHaveURL(/sessionId=/);
  await page.getByLabel('Article text').fill('Corrected 1949 transcription.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.getByLabel('What was corrected in this transcription?').fill('Corrected the historical transcription.');
  await page.getByRole('button', { name: 'Save comment' }).click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  const historicalCorrectionUrl = page.url();
  await signOut(page);
  await signInReviewer(page);
  await page.goto(historicalCorrectionUrl);
  await page.getByRole('button', { name: 'Approve review' }).click();
  const approvedHistoricalCorrectionUrl = page.url();
  await signOut(page);
  await signInPublisher(page);
  await page.goto(approvedHistoricalCorrectionUrl);
  await page.getByRole('button', { name: 'Publish transcription' }).click();
  await expect(page.getByText('Published as version 1949-1.')).toBeVisible();
  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByRole('link', { name: /Legal changes/ })).toContainText('1');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
  await signInPublisher(page);
  await page.goto('/editor/amendments');
  await expect(page.locator('.badge', { hasText: 'Needs review' }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Update to Article 1' }).click();
  await expect(page.getByRole('heading', { name: 'Flagged record review' })).toBeVisible();
  await expect(page.locator('#amendment-comment')).toHaveValue('The published legal-change comment.');
  await page.getByRole('button', { name: 'Confirm live quotes and republish' }).click();
  await expect(page.getByText('Quotes confirmed and the legal change republished.')).toBeVisible();
  await expect(page.locator('#amendment-comment')).toHaveValue('The published legal-change comment.');
  await page.reload();
  await page.goto('/editor/amendments');
  await expect(page.locator('.badge', { hasText: 'Needs review' })).toHaveCount(0);
  await signOut(page);
  await page.goto('/countries/DE/timeline');
  await expect(page.getByText('Update to Article 1')).toBeVisible();
  await expect(page.getByText('The published legal-change comment.')).toBeVisible();
});

test('editorial correction hop stays off the public timeline', async ({ page }) => {
  await page.goto('/countries/DE/timeline');
  const timelineCount = await page.locator('.timeline-item').count();
  await signInEditor(page);
  await startEditorSession(page, VERSION_2022, 'editorial_correction');
  await expect(page).toHaveURL(/sessionId=/);
  await expect(page.getByRole('heading', { name: 'Articles' })).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill('Human dignity (typo fix)');
  await page.getByLabel('Article text').fill('Corrected transcription.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page).toHaveURL(/saved=1/);
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await page.getByLabel('What was corrected in this transcription?').fill('Corrected text.');
  await page.getByRole('button', { name: 'Save comment' }).click();
  await expect(page).toHaveURL(/detailsSaved=1/);
  await expect(page.getByText('Publish details saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page).toHaveURL(/reviewed=1/);
  await expect(page.getByText('Submitted for review.')).toBeVisible();
  const correctionUrl = page.url();
  await signOut(page);
  await signInReviewer(page);
  await page.goto(correctionUrl);
  await page.getByRole('button', { name: 'Approve review' }).click();
  await expect(page).toHaveURL(/approved=1/);
  await expect(page.getByText('Review approved.')).toBeVisible();
  const approvedCorrectionUrl = page.url();
  await signOut(page);
  await signInPublisher(page);
  await page.goto(approvedCorrectionUrl);
  await page.getByRole('button', { name: 'Publish transcription' }).click();
  await expect(page.getByText('Published as version 2022-1.')).toBeVisible();
  await signOut(page);
  await page.goto('/countries/DE/timeline');
  await expect(page.locator('.timeline-item')).toHaveCount(timelineCount);
  await expect(page.getByText('Update to Article 1')).toBeVisible();
  await signInEditor(page);
  await page.goto('/editor/history');
  await expect(page.getByRole('heading', { name: 'Snapshot history' })).toBeVisible();
  await expect(page.getByRole('link', { name: '2022-1' })).toBeVisible();
  await expect(page.getByText('Editorial correction', { exact: true })).toBeVisible();
  await expect(page.getByText('No publication comment')).toBeVisible();
});

test('published article titles remain read-only for editors', async ({ page }) => {
  await signInEditor(page);
  await page.goto(`/countries/DE/versions/${VERSION_2022}/articles/${ARTICLE_1}`);
  await expect(page.getByRole('heading', { name: /Human dignity/ })).toBeVisible();
  await expect(page.getByLabel(/Title for/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save title' })).toHaveCount(0);
});

test('editor inspects and restores a legal-change revision as a new draft', async ({ page }) => {
  await signInEditor(page);
  await page.goto('/editor/amendments/01900000-0000-4000-8000-000000000302');
  const history = page.getByRole('complementary', { name: 'Revision history' });
  await history.locator('button.revision-item').first().click();
  await expect(page.getByText('Viewing a past revision read-only.')).toBeVisible();
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/editor/amendments/')),
    history.getByRole('button', { name: 'Restore as new draft' }).click(),
  ]);
  await expect(page).toHaveURL(/saved=1/, { timeout: 20_000 });
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Update to Article 1');
  await page.reload();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Update to Article 1');
});

test('publisher withdraws an incorrect published legal-change record', async ({ page }) => {
  await signInPublisher(page);
  await page.goto('/editor/amendments/01900000-0000-4000-8000-000000000301');
  await page.getByRole('button', { name: 'Withdraw' }).click();
  await expect(page.getByText('Amending law withdrawn.')).toBeVisible();
  await expect(page.getByText('withdrawn', { exact: true })).toBeVisible();
});

test('legal successor passes queues and requires fresh authentication before publication', async ({ page, request }) => {
  await signInEditor(page);
  await startEditorSession(page, VERSION_2022, 'legal');
  await page.getByRole('region', { name: 'Article' }).getByLabel('Title', { exact: true }).fill('Human dignity in 2027');
  await page.getByLabel('Article text').fill('The 2027 legally amended text.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.getByLabel('Title', { exact: true }).last().fill('2027 dignity amendment');
  await page.getByLabel('Comment', { exact: true }).fill('Parliament amended Article 1.');
  await page.getByLabel('Document URL').fill('https://example.gov/2027-dignity.pdf');
  await page.getByLabel('Document label').fill('Official 2027 act');
  await page.getByRole('button', { name: 'Save change record' }).click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await signOut(page);

  await signInReviewer(page);
  await page.goto('/editor?status=reviewing');
  await page.locator('.editor-session-list').getByRole('link').first().click();
  await expect(page.getByText('2027 dignity amendment')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Official 2027 act' })).toHaveAttribute('href', 'https://example.gov/2027-dignity.pdf');
  await page.getByRole('button', { name: 'Approve review' }).click();
  await signOut(page);

  await signInPublisher(page);
  await page.goto('/editor?status=approved');
  await page.locator('.editor-session-list').getByRole('link').first().click();
  expect((await request.post(`${MOCK_ORIGIN}/__step_up_stale`)).ok()).toBeTruthy();
  await page.getByRole('button', { name: 'Publish new legal version' }).click();
  await expect(page).toHaveURL(/\/account\/step-up/);
  await page.getByLabel('Authenticator code').fill('123456');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Publish new legal version' }).click();
  await expect(page.getByText(/Published as version 2027.*2027 dignity amendment/)).toBeVisible();
  await signOut(page);
  await page.goto('/countries/DE');
  await expect(page.getByRole('link', { name: '2027' })).toBeVisible();
});
