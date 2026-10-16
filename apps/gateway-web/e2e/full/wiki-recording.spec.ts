import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authenticatorCode, signIn, startFromViewer } from './auth';

type Role = 'editor' | 'reviewer' | 'publisher';
const outputDir = process.env.WIKI_VIDEO_DIR ?? join(__dirname, '../../../../docs/wiki/media');
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:18080';
const correction = 'Dignity and civic equality protect every person. Verified transcription.';

async function publishedVersion(request: APIRequestContext): Promise<{ countryIso: string; versionId: string }> {
  const countries = await (await request.get('/api/catalog/countries')).json();
  for (const summary of countries) {
    const country = await (await request.get(`/api/catalog/countries/${summary.isoCode}`)).json();
    for (const constitution of country.constitutions ?? []) {
      for (const version of constitution.versions ?? []) {
        const versionId = version.currentVersionId ?? version.id;
        if (!versionId) continue;
        const response = await request.get(`/api/content/versions/${versionId}/articles?includeBody=true`);
        if (response.ok() && (await response.json()).some((article: { children?: unknown[] }) => !article.children?.length)) {
          return { countryIso: summary.isoCode, versionId };
        }
      }
    }
  }
  throw new Error('No published constitution with a plain article is available for recording');
}

async function caption(page: Page, label: string) {
  await page.evaluate((text) => {
    document.getElementById('wiki-video-caption')?.remove();
    const box = document.createElement('div');
    box.id = 'wiki-video-caption';
    box.textContent = text;
    Object.assign(box.style, {
      position: 'fixed', top: '18px', right: '18px', zIndex: '2147483647',
      maxWidth: '380px', padding: '12px 16px', borderRadius: '10px',
      background: '#172b4d', color: 'white', font: '600 16px/1.4 system-ui',
      boxShadow: '0 4px 18px #0004', pointerEvents: 'none',
    });
    document.body.append(box);
  }, label);
  await page.waitForTimeout(2800);
}

async function record(browser: Browser, role: Role, file: string, stagingDir: string,
  walk: (page: Page) => Promise<void>): Promise<string> {
  // Sign-in occurs before recording, so credentials never appear in the clip.
  const login = await browser.newContext({ baseURL });
  const loginPage = await login.newPage();
  await signIn(loginPage, role);
  const state = await login.storageState();
  await login.close();

  const context = await browser.newContext({
    baseURL, storageState: state, viewport: { width: 1280, height: 720 },
    recordVideo: { dir: stagingDir, size: { width: 1280, height: 720 } },
  });
  await context.addInitScript(() => {
    localStorage.setItem('ca_cookie_notice_v1', 'dismissed');
    const style = document.createElement('style');
    style.textContent = 'input[type=password], input[autocomplete="one-time-code"], input[name*="code" i], input[id*="code" i] { filter: blur(12px) !important; }';
    document.addEventListener('DOMContentLoaded', () => document.head.append(style), { once: true });
  });
  const page = await context.newPage();
  const video = page.video();
  try {
    await walk(page);
  } finally {
    await context.close();
  }
  if (!video) throw new Error(`No video was captured for ${role}`);
  const staged = join(stagingDir, file);
  await rename(await video.path(), staged);
  if ((await stat(staged)).size < 10_000) throw new Error(`Video is unexpectedly small: ${file}`);
  return staged;
}

test('record editing, review, and publishing against the full stack', async ({ browser, request }) => {
  const stagingDir = await mkdtemp(join(tmpdir(), 'wiki-videos-'));
  try {
    const clips: string[] = [];
    const source = await publishedVersion(request);
    let sessionUrl = '';
    let sourceVersionId = '';
    let articleNumber = '';
    let publishedVersionId = '';

    clips.push(await record(browser, 'editor', 'editing-a-draft.webm', stagingDir, async (page) => {
      await page.goto(`/countries/${source.countryIso}/versions/${source.versionId}`);
      await expect(page.getByRole('link', { name: 'Edit this constitution' })).toBeVisible();
      await caption(page, 'Editor · Choose a published text');
      sourceVersionId = source.versionId;
      await startFromViewer(page, source.countryIso, sourceVersionId, 'editorial_correction');
      await expect(page).toHaveURL(/sessionId=/);
      const articles = await (await request.get(`/api/content/versions/${sourceVersionId}/articles?includeBody=true`)).json();
      const article = articles.find((item: { children?: unknown[] }) => !item.children?.length);
      expect(article).toBeTruthy();
      articleNumber = article.articleNumber;
      const target = new URL(page.url());
      target.searchParams.set('articleId', article.id);
      await page.goto(target.toString());
      await caption(page, 'Edit the selected article');
      await page.locator('#draft-form textarea').first().fill(correction);
      await page.getByRole('button', { name: 'Save draft' }).click();
      await expect(page.getByText('Draft saved.')).toBeVisible();
      await caption(page, 'Describe the transcription correction');
      await page.getByLabel('What was corrected in this transcription?').fill(`Verified Article ${articleNumber} transcription.`);
      await page.getByRole('button', { name: 'Save comment' }).click();
      await caption(page, 'Submit the saved draft for review');
      await page.getByRole('button', { name: 'Submit for review' }).click();
      await expect(page.getByText('Submitted for review.')).toBeVisible();
      sessionUrl = page.url();
      await caption(page, 'The draft is waiting for an independent reviewer');
    }));

    clips.push(await record(browser, 'reviewer', 'reviewing-a-draft.webm', stagingDir, async (page) => {
      await page.goto('/editor?status=reviewing');
      await expect(page.getByRole('heading', { name: 'Review queue' })).toBeVisible();
      await caption(page, 'Reviewer · Open the review queue');
      await page.goto(sessionUrl);
      await expect(page.getByText(correction).first()).toBeVisible();
      await caption(page, 'Compare the draft with its published source');
      await page.getByRole('button', { name: 'Approve review' }).click();
      await expect(page.getByText('Review approved. A publisher can now publish.')).toBeVisible();
      await caption(page, 'The revision is approved for publication');
    }));

    clips.push(await record(browser, 'publisher', 'publishing-a-revision.webm', stagingDir, async (page) => {
      await page.goto('/editor?status=approved');
      await expect(page.getByRole('heading', { name: 'Ready to publish' })).toBeVisible();
      await caption(page, 'Publisher · Open approved work');
      await page.goto(sessionUrl);
      await expect(page.getByText(correction).first()).toBeVisible();
      await caption(page, 'Check the approved text and publication details');
      await page.getByRole('button', { name: 'Publish transcription' }).click();
      await expect(page).toHaveURL(/(?:published=1|\/account\/step-up\?)/, { timeout: 15_000 });
      if (/\/account\/step-up\?/.test(page.url())) {
        await caption(page, 'Complete the fresh authenticator check');
        await page.getByLabel('Authenticator code').fill(authenticatorCode(process.env.IDENTITY_SEED_TOTP_SECRET ?? 'CAATLASMFASEED22'));
        await page.getByRole('button', { name: 'Continue' }).click();
      }
      await expect(page.getByText(/Published as version/)).toBeVisible();
      publishedVersionId = new URL(page.url()).searchParams.get('newVersionId') ?? '';
      expect(publishedVersionId).toBeTruthy();
      await caption(page, 'The corrected version is published');
    }));

    const published = await (await request.get(`/api/content/versions/${publishedVersionId}/articles?includeBody=true`)).json();
    const changed = published.find((item: { articleNumber: string }) => item.articleNumber === articleNumber);
    expect(changed.body).toContain('Verified transcription.');
    await mkdir(outputDir, { recursive: true });
    for (const clip of clips) await rename(clip, join(outputDir, clip.split('/').pop()!));
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
});
