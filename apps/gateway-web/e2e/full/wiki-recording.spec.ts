import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { mkdir, mkdtemp, rename, rm, stat, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ui, message, type UiMessage } from '../../lib/messages';
import { authenticatorCode, signIn } from './auth';
import { illustrate, installPresentation, Walkthrough } from './wiki-presentation';

type Locale = 'en' | 'de';
type Role = 'editor' | 'reviewer' | 'publisher' | 'admin';
const outputDir = process.env.WIKI_VIDEO_DIR ?? join(__dirname, '../../../../docs/wiki/media');
const capture = process.env.WIKI_MEDIA_CAPTURE === 'merged';
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:18080';

// Screenshots are published evidence, not local test baselines. Only the merged-PR
// workflow may refresh them; regular PR/full-stack suites exclude this file.
test.beforeAll(() => {
  if (process.env.CI !== 'true' || !['merged', 'verify'].includes(process.env.WIKI_MEDIA_CAPTURE ?? '')) {
    throw new Error('Wiki journeys require CI: verify without media, or capture after a merge');
  }
});

async function publishedVersion(request: APIRequestContext) {
  const countries = await (await request.get('/api/catalog/countries')).json();
  for (const summary of countries) {
    const country = await (await request.get(`/api/catalog/countries/${summary.isoCode}`)).json();
    for (const constitution of country.constitutions ?? []) {
      for (const version of constitution.versions ?? []) {
        const versionId = version.currentVersionId ?? version.id;
        if (!versionId) continue;
        const response = await request.get(`/api/content/versions/${versionId}/articles?includeBody=true`);
        if (!response.ok()) continue;
        const article = (await response.json()).find((item: { children?: unknown[] }) => !item.children?.length);
        if (article) return { countryIso:summary.isoCode as string, versionId:versionId as string, article };
      }
    }
  }
  throw new Error('No published constitution with a plain article is available');
}

async function authenticated(browser: Browser, role: Role, locale: Locale) {
  // Authenticate before creating the recording context. Credentials never appear.
  const login = await browser.newContext({ baseURL, locale:'en-GB' });
  try {
    await signIn(await login.newPage(), role);
    return await browser.newContext({
      baseURL, locale:locale === 'de' ? 'de-DE' : 'en-GB',
      storageState:await login.storageState(), viewport:{ width:1280, height:900 },
    });
  } finally { await login.close(); }
}

async function selectArticle(page: Page, watch: Walkthrough, articleId: string) {
  const articleLink = page.locator(`a[href*="articleId=${articleId}"]`).first();
  await watch.click(articleLink);
  await expect(articleLink).toHaveAttribute('aria-current', 'true');
}

async function record(browser: Browser, role: Exclude<Role, 'admin'>, locale: Locale, file: string, staging: string,
  walk: (page: Page, presentation: Walkthrough) => Promise<void>) {
  const login = await authenticated(browser, role, locale);
  const state = await login.storageState();
  await login.close();
  const context = await browser.newContext({
    baseURL, locale:locale === 'de' ? 'de-DE' : 'en-GB', storageState:state,
    viewport:{ width:1280, height:900 }, recordVideo:capture ? { dir:staging, size:{ width:1280, height:900 } } : undefined,
  });
  await installPresentation(context);
  const page = await context.newPage();
  const video = page.video();
  try { await walk(page, new Walkthrough(page)); }
  finally { await context.close(); }
  if (!capture) return '';
  if (!video) throw new Error(`No video captured for ${role}`);
  const path = join(staging, file);
  await rename(await video.path(), path);
  if ((await stat(path)).size < 10_000) throw new Error(`Video unexpectedly small: ${file}`);
  return path;
}

for (const locale of ['en', 'de'] as const) {
  test(`capture ${locale} wiki illustrations and editorial walkthroughs`, async ({ browser, request }) => {
    const staging = await mkdtemp(join(tmpdir(), 'wiki-media-'));
    const paths: string[] = [];
    const text = (en: string, de: string) => locale === 'de' ? de : en;
    const t = (value: UiMessage) => message(locale, value);
    const source = await publishedVersion(request);
    const correction = `Dignity and civic equality protect every person. Verified transcription (${locale}).`;
    let sessionId = '';
    let publishedVersionId = '';
    const shot = async (page: Page, name: string, target?: ReturnType<Page['locator']>) => {
      const path = join(staging, `${name}-${locale}.png`);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      if (capture) { await illustrate(page, path, target); paths.push(path); }
    };
    try {
      const publicContext = await browser.newContext({ baseURL, locale:locale === 'de' ? 'de-DE' : 'en-GB', viewport:{ width:1280, height:900 } });
      await installPresentation(publicContext);
      try {
        const page = await publicContext.newPage();
        await page.goto(`/countries/${source.countryIso}`);
        await expect(page.getByRole('heading', { level:1 })).toBeVisible();
        await expect(page.locator('a[href*="/versions/"]').first()).toBeVisible();
        await shot(page, 'reading-country');
        await page.goto(`/countries/${source.countryIso}/versions/${source.versionId}`);
        await expect(page.getByRole('heading', { level:1 })).toBeVisible();
        await shot(page, 'reading-text');
        await page.goto(`/countries/${source.countryIso}/compare`);
        await expect(page.locator('#compare-from')).toBeVisible();
        await expect(page.locator('#compare-to')).toBeVisible();
        await shot(page, 'reading-compare');
      } finally { await publicContext.close(); }
      const admin = await authenticated(browser, 'admin', locale);
      await installPresentation(admin);
      try {
        const page = await admin.newPage();
        await page.goto('/account');
        await shot(page, 'account-security', page.locator('#security'));
        await page.goto('/admin');
        await expect(page.getByRole('heading', { level:1 })).toBeVisible();
        await shot(page, 'admin-overview');
        await page.goto('/admin/import');
        await expect(page.locator('input[type=file]')).toBeAttached();
        await shot(page, 'admin-import');
      } finally { await admin.close(); }

      paths.push(await record(browser, 'editor', locale, `editing-a-draft-${locale}.webm`, staging, async (page, watch) => {
        await page.goto(`/countries/${source.countryIso}/versions/${source.versionId}`);
        await watch.explain(text('Editor: start from the published text.', 'Bearbeitung: Beginnen Sie beim veröffentlichten Text.'));
        await watch.click(page.getByRole('link', { name:t(ui.countries.code.versions.versionid.page.editThisConstitution) }));
        await watch.explain(text('Choose a text correction for a transcription error.', 'Wählen Sie die Textkorrektur für einen Übertragungsfehler.'));
        await watch.click(page.locator('#editor-entry').getByRole('button', { name:t(ui.remainingStatus.correctThisText) }));
        await expect(page).toHaveURL(/sessionId=/);
        sessionId = new URL(page.url()).searchParams.get('sessionId') ?? '';
        expect(sessionId).toBeTruthy();
        await selectArticle(page, watch, source.article.id);
        await expect(page.locator('#draft-form input[name=articleId]')).toHaveValue(source.article.id);
        await watch.explain(text('Edit the selected article, then save the draft.', 'Bearbeiten Sie den Artikel und speichern Sie den Entwurf.'));
        await watch.type(page.locator('#draft-form textarea').first(), correction);
        await shot(page, 'editor-draft', page.locator('#draft-form'));
        await watch.click(page.locator('#draft-form button[type=submit]'));
        await expect(page.getByText(t(ui.editor.page.draftSaved), { exact:true })).toBeVisible();
        await watch.explain(text('Describe the correction so the reviewer can check it.', 'Beschreiben Sie die Korrektur für die anschließende Prüfung.'));
        await watch.type(page.getByLabel(t(ui.attrs.editorPublishformTextAreaLabelWhatWas)), text('Checked the transcription against its source.', 'Übertragung anhand der Quelle geprüft.'));
        await watch.click(page.locator('form').filter({ has:page.locator('input[name=command][value=details]') }).getByRole('button').last());
        await watch.explain(text('Submit the saved draft for independent review.', 'Reichen Sie den gespeicherten Entwurf zur Prüfung ein.'));
        await watch.click(page.getByRole('button', { name:t(ui.editor.editordraftstate.submitForReview) }));
        await expect(page.getByText(t(ui.editor.page.submittedForReview), { exact:true })).toBeVisible();
        await watch.explain(text('The draft is now waiting in the review queue.', 'Der Entwurf wartet jetzt in der Prüfliste.'));
      }));
      paths.push(await record(browser, 'reviewer', locale, `reviewing-a-draft-${locale}.webm`, staging, async (page, watch) => {
        await page.goto('/editor?status=reviewing');
        await expect(page.getByRole('heading', { name:t(ui.nav.reviewQueue), exact:true })).toBeVisible();
        await watch.explain(text('Reviewer: open the submitted session from the queue.', 'Prüfung: Öffnen Sie die eingereichte Sitzung aus der Prüfliste.'));
        await watch.click(page.locator(`a[href*="sessionId=${sessionId}"]`).first());
        await selectArticle(page, watch, source.article.id);
        await expect(page.getByText(correction).first()).toBeVisible();
        await watch.explain(text('Compare the draft, its source and the correction comment.', 'Vergleichen Sie Entwurf, Quelle und Korrekturkommentar.'));
        await shot(page, 'editor-review');
        await watch.click(page.getByRole('button', { name:t(ui.editor.page.approveReview) }));
        await expect(page.getByText(t(ui.editor.page.reviewApprovedAPublisherCanNowPublish), { exact:true })).toBeVisible();
        await watch.explain(text('Approved for publication. The public text has not changed yet.', 'Freigegeben. Der öffentliche Text ist noch unverändert.'));
      }));
      paths.push(await record(browser, 'publisher', locale, `publishing-a-revision-${locale}.webm`, staging, async (page, watch) => {
        await page.goto('/editor?status=approved');
        await expect(page.getByRole('heading', { name:t(ui.nav.readyToPublish), exact:true })).toBeVisible();
        await watch.explain(text('Publisher: open the approved session.', 'Veröffentlichung: Öffnen Sie die freigegebene Sitzung.'));
        await watch.click(page.locator(`a[href*="sessionId=${sessionId}"]`).first());
        await selectArticle(page, watch, source.article.id);
        await expect(page.getByText(correction).first()).toBeVisible();
        await watch.explain(text('Check the approved text and its change type.', 'Kontrollieren Sie Text und Änderungsart.'));
        await shot(page, 'editor-publish');
        await watch.click(page.getByRole('button', { name:t(ui.editorDynamic.publishTranscription) }));
        await expect(page).toHaveURL(/(?:published=1|\/account\/step-up\?)/, { timeout:15_000 });
        if (/\/account\/step-up\?/.test(page.url())) {
          await watch.explain(text('Confirm your identity with a fresh authenticator code.', 'Bestätigen Sie Ihre Identität mit einem aktuellen Authenticator-Code.'));
          await page.getByLabel(t(ui.attrs.accountStepUpPageInputLabelAuthenticator)).fill(authenticatorCode(process.env.IDENTITY_SEED_TOTP_SECRET ?? 'CAATLASMFASEED22'));
          await watch.click(page.getByRole('button', { name:text('Continue', 'Weiter'), exact:true }));
        }
        await expect(page.getByText(t(ui.editorDynamic.publishedAsVersion), { exact:false })).toBeVisible();
        publishedVersionId = new URL(page.url()).searchParams.get('newVersionId') ?? '';
        expect(publishedVersionId).toBeTruthy();
        await watch.explain(text('Published. Reopen the version from its country page.', 'Veröffentlicht. Öffnen Sie die Fassung auf der Länderseite erneut.'));
        await page.goto(`/countries/${source.countryIso}`);
        await watch.click(page.locator(`a[href="/countries/${source.countryIso}/versions/${publishedVersionId}"]`).first());
        await expect(page).toHaveURL(new RegExp(`/versions/${publishedVersionId}$`));
        const publicCorrection = page.getByText(correction).first();
        await expect(publicCorrection).toBeVisible();
        await watch.point(publicCorrection);
        await watch.explain(text('The correction is public; the previous snapshot is preserved.', 'Die Korrektur ist öffentlich; der vorherige Textstand bleibt erhalten.'));
      }));
      const published = await (await request.get(`/api/content/versions/${publishedVersionId}/articles?includeBody=true`)).json();
      expect(published.find((item: { articleNumber: string }) => item.articleNumber === source.article.articleNumber).body).toContain(`Verified transcription (${locale}).`);
      if (capture) {
        await mkdir(outputDir, { recursive:true });
        for (const path of paths) await copyFile(path, join(outputDir, path.split('/').pop()!));
      }
    } finally { await rm(staging, { recursive:true, force:true }); }
  });
}
