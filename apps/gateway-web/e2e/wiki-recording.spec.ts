/* eslint-disable */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VERSION_2022, signInEditor, signInPublisher, signInReviewer } from './helpers';

const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_WEB_PORT ?? 3100}`;
const mockOrigin = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
const outputDir = process.env.WIKI_VIDEO_DIR ?? join(__dirname, '../../../docs/wiki/media');

async function scene(page: Page, title: string) {
  console.log('video scene:', title);
  await page.evaluate((label) => {
    document.getElementById('wiki-video-caption')?.remove();
    const caption = document.createElement('div');
    caption.id = 'wiki-video-caption';
    caption.textContent = label;
    Object.assign(caption.style, {
      position: 'fixed', top: '18px', right: '18px', zIndex: '2147483647',
      maxWidth: '360px', padding: '12px 16px', borderRadius: '10px',
      background: '#172b4d', color: 'white', font: '600 16px/1.4 system-ui',
      boxShadow: '0 4px 18px #0004', pointerEvents: 'none',
    });
    document.body.append(caption);
  }, title);
  await page.waitForTimeout(2800);
}

async function record(
  browser: Browser,
  signIn: (page: Page) => Promise<void>,
  file: string,
  stagingDir: string,
  walkthrough: (page: Page) => Promise<void>,
): Promise<string> {
  console.log('video auth:', file);
  const authContext = await browser.newContext({ baseURL });
  authContext.setDefaultTimeout(15_000);
  authContext.setDefaultNavigationTimeout(30_000);
  const authPage = await authContext.newPage();
  await signIn(authPage);
  const cookieNotice = authPage.getByRole('button', { name: 'Verstanden' });
  if (await cookieNotice.isVisible()) await cookieNotice.click();
  console.log('video auth complete:', file);
  const storageState = await authContext.storageState();
  await authContext.close();

  const context = await browser.newContext({
    baseURL,
    storageState,
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: stagingDir, size: { width: 1280, height: 720 } },
  });
  context.setDefaultTimeout(15_000);
  context.setDefaultNavigationTimeout(30_000);
  const page = await context.newPage();
  page.on('pageerror', error => console.log('video page error:', error.message));
  const video = page.video();
  let completed = false;
  try {
    console.log('video capture start:', file);
    await walkthrough(page);
    completed = true;
  } finally {
    console.log('video context close:', file);
    await context.close();
  }
  if (!completed || !video) throw new Error(`Video capture failed: ${file}`);
  const stagedPath = join(stagingDir, file);
  await rename(await video.path(), stagedPath);
  if ((await stat(stagedPath)).size < 10_000) throw new Error(`Video is unexpectedly small: ${file}`);
  return stagedPath;
}

test('wiki video: edit, review, and publish a transcription correction', async ({ browser, request }) => {
  await mkdir(outputDir, { recursive: true });
  const stagingDir = await mkdtemp(join(tmpdir(), 'wiki-videos-'));
  const clips: string[] = [];
  try {
  expect((await request.post(`${mockOrigin}/__reset`)).ok()).toBeTruthy();

  clips.push(await record(browser, signInEditor, 'editing-a-draft.webm', stagingDir, async (page) => {
    await page.goto('/editor');
    await scene(page, 'Editor · Open the editing workspace');
    await scene(page, 'Choose a transcription correction');
    const versionPicker = page.getByLabel('Correct this text');
    if (await versionPicker.isVisible()) {
      await versionPicker.selectOption(VERSION_2022);
      await page.getByRole('button', { name: 'Correct this text' }).click();
    } else {
      await page.goto(`/countries/DE/versions/${VERSION_2022}`);
      await page.getByRole('link', { name: 'Edit this constitution' }).click();
      await page.locator('#editor-entry').getByRole('button', { name: 'Correct this text' }).click();
    }
    await expect(page).toHaveURL(/sessionId=/);
    await scene(page, 'Edit the draft text');
    await page.getByLabel('Title', { exact: true }).fill('Human dignity (corrected transcription)');
    await page.getByLabel('Article text').fill('Human dignity is inviolable.');
    await scene(page, 'Save and inspect the draft preview');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible();
    await scene(page, 'Describe the correction');
    await page.getByLabel('What was corrected in this transcription?').fill('Corrected the transcription of Article 1.');
    await page.getByRole('button', { name: 'Save comment' }).click();
    await expect(page.getByText('Publish details saved.')).toBeVisible();
    await scene(page, 'Submit the draft for independent review');
    await page.getByRole('button', { name: 'Submit for review' }).click();
    await expect(page.getByText('Submitted for review.')).toBeVisible();
    await scene(page, 'The draft is waiting in the review queue');
  }));

  clips.push(await record(browser, signInReviewer, 'reviewing-a-draft.webm', stagingDir, async (page) => {
    await page.goto('/editor?status=reviewing');
    await expect(page.getByRole('heading', { name: 'Review queue' })).toBeVisible();
    await scene(page, 'Reviewer · Open the review queue');
    await page.locator('.data-row, .editor-session-list').getByRole('link').first().click();
    await expect(page.getByText('Preview', { exact: true })).toBeVisible();
    await scene(page, 'Compare the draft with the published text');
    await expect(page.getByLabel('Article 1').getByText('Human dignity is inviolable.')).toBeVisible();
    await scene(page, 'Approve the checked revision');
    await page.getByRole('button', { name: 'Approve review' }).click();
    await expect(page.getByText('Review approved.')).toBeVisible();
    await scene(page, 'The approved revision can now be published');
  }));

  clips.push(await record(browser, signInPublisher, 'publishing-a-revision.webm', stagingDir, async (page) => {
    await page.goto('/editor?status=approved');
    await expect(page.getByRole('heading', { name: 'Ready to publish' })).toBeVisible();
    await scene(page, 'Publisher · Open approved work');
    await page.locator('.data-row, .editor-session-list').getByRole('link').first().click();
    await expect(page.getByText('Preview', { exact: true })).toBeVisible();
    await scene(page, 'Check the approved revision and publication details');
    await page.getByRole('button', { name: 'Publish transcription' }).click();
    await expect(page.getByText('Published as version 2022-1.')).toBeVisible();
    await scene(page, 'A new published version is available');
  }));
  for (const clip of clips) await rename(clip, join(outputDir, clip.split('/').pop()!));
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
});
