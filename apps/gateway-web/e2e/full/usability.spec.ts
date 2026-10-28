import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '../fixtures/consent';
import { adminHeaders, createIsolatedConstitution } from './api-fixtures';
import { authenticatorCode, signIn, signOut, startFromViewer } from './auth';

async function sessionDetails(page: Page) {
  const summary = page.locator('summary').filter({ hasText: 'Session and publication' });
  if (!(await summary.evaluate(element => element.parentElement!.hasAttribute('open')))) await summary.click();
}

test.use({ locale: 'en-US', extraHTTPHeaders: { 'Accept-Language': 'en' }, screenshot: 'only-on-failure', actionTimeout: 20_000 });

async function createEditorAccount(request: APIRequestContext) {
  const email = `usability-editor-${randomUUID()}@example.invalid`;
  const password = `Usability-${randomUUID()}-9!`;
  const invitationResponse = await request.post('/api/identity/users/invites', {
    headers: await adminHeaders(request), data: { email, roles: ['editor'] },
  });
  expect(invitationResponse.ok(), `Create isolated editor: HTTP ${invitationResponse.status()}`).toBeTruthy();
  const invitation = await invitationResponse.json();
  expect(invitation.user.roles).toEqual(['editor']);
  const activation = await request.post('/api/identity/invites/accept', { data: { token: invitation.inviteToken, password } });
  expect(activation.ok(), `Activate isolated editor: HTTP ${activation.status()}`).toBeTruthy();
  const loginResponse = await request.post('/api/identity/login', { data: { email, password } });
  expect(loginResponse.ok()).toBeTruthy();
  const login = await loginResponse.json();
  expect(login.user.roles).toEqual(['editor']);
  expect(login.token).toBeTruthy();
  return { email, password, headers: { Authorization: `Bearer ${login.token}` } };
}

async function signInAsEditor(page: Page, account: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);
}

async function signInToProtectedPage(page: Page, role: 'reviewer' | 'publisher', destination: string) {
  await page.goto(destination);
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get('next')).toBe(destination);
  await page.getByLabel('Email', { exact: true }).fill(process.env[`CI_${role.toUpperCase()}_EMAIL`] ?? `ci-${role}@example.local`);
  await page.getByLabel('Password', { exact: true }).fill(process.env[`CI_${role.toUpperCase()}_PASSWORD`] ?? 'change-me');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  if (role === 'publisher') {
    await expect(page.getByRole('heading', { name: 'Authenticator code', exact: true })).toBeVisible();
    await page.getByLabel('Authenticator code', { exact: true }).fill(authenticatorCode(process.env.IDENTITY_SEED_TOTP_SECRET ?? 'CAATLASMFASEED22'));
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  }
  await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(destination);
}

function ownWorkRow(page: Page, sessionId: string) {
  return page.locator('.editor-session-list > li').filter({ has: page.locator(`a[href*="sessionId=${sessionId}"]`) });
}

async function readPublishedText(page: Page, href: string, text: string) {
  const response = await page.goto(href);
  expect(response?.status(), `Published reader ${href}`).toBe(200);
  await expect(page.locator('.version-articles'), `Published snapshot ${href} must remain readable`).toBeVisible();
  await page.locator('.version-articles .article-toggle').first().click();
  await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
}

test('reviewer sign-in returns to the protected queue with its filter', async ({ page }) => {
  await signInToProtectedPage(page, 'reviewer', '/editor?status=reviewing');
  await expect(page.getByRole('heading', { name: 'Review queue', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Review queue', exact: true }).first()).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: 'My work', exact: true })).toHaveCount(0);
});

test('owned work survives role handoffs and published corrections remain readable after a successor', async ({ page, request }, testInfo) => {
  test.setTimeout(360_000);
  const title = `Usability verification charter ${randomUUID()}`;
  const fixture = await createIsolatedConstitution(request, title);
  const editor = await createEditorAccount(request);
  const originalText = 'A civic duty protects every person.';
  const corrections = [
    'A civic duty protects every person. The first verified transcription is preserved.',
    'A civic duty protects every person. The second verified transcription is current.',
  ];
  const published: { sessionId: string; sessionPath: string; href: string; versionId: string }[] = [];
  let sourceVersionId = fixture.targetVersionId;

  for (const [index, correctedText] of corrections.entries()) {
    await signInAsEditor(page, editor);
    await expect(page.getByRole('link', { name: 'Review queue', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Ready to publish', exact: true })).toHaveCount(0);
    await startFromViewer(page, fixture.countryIso, sourceVersionId, 'editorial_correction');
    const sessionId = new URL(page.url()).searchParams.get('sessionId');
    expect(sessionId).toBeTruthy();
    const sessionPath = `/editor?sessionId=${sessionId}&versionId=${sourceVersionId}`;
    await expect(page.getByRole('link', { name: 'Constitution structure settings', exact: true })).toHaveCount(0);
    const submit = page.getByRole('button', { name: 'Submit for review', exact: true });
    await expect(submit).toBeDisabled();
    await expect(page.getByRole('link', { name: 'Describe what you corrected and save the comment.', exact: true })).toBeVisible();

    const text = page.locator('#draft-form textarea').first();
    await expect(text).toHaveValue(index === 0 ? originalText : corrections[index - 1]);
    const interimText = correctedText.replace('verified', 'checked');
    await text.fill(interimText);
    await expect(submit).toBeDisabled();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(text).toHaveValue(interimText);

    const comment = `Checked fictional Article 1 against source, correction ${index + 1}.`;
    await sessionDetails(page);
    await page.getByLabel('What was corrected in this transcription?', { exact: true }).fill(comment);
    await expect(submit).toBeDisabled();
    await page.getByRole('button', { name: 'Save comment', exact: true }).click();
    await expect(page.getByText('Publish details saved.', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(submit).toBeEnabled();

    // A changed, previously saved comment must not silently submit its old value.
    const finalComment = `${comment} Wording and punctuation verified.`;
    await sessionDetails(page);
    await page.getByLabel('What was corrected in this transcription?', { exact: true }).fill(finalComment);
    await expect(submit).toBeDisabled();
    await expect(page.getByText('Save your changes to the comment or change record.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save comment', exact: true }).click();
    await expect(submit).toBeEnabled();
    await page.reload();
    await sessionDetails(page);
    await expect(page.getByLabel('What was corrected in this transcription?', { exact: true })).toHaveValue(finalComment);
    // Once all saved requirements are ready, a later text edit must gate submission too.
    await expect(submit).toBeEnabled();
    await text.fill(correctedText);
    await expect(submit).toBeDisabled();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(text).toHaveValue(correctedText);
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByText('Submitted for review.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve review', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Publish transcription', exact: true })).toHaveCount(0);
    const forbiddenApproval = await request.post(`/api/editor/edit-sessions/${sessionId}/approval`, { headers: editor.headers });
    expect(forbiddenApproval.status()).toBe(403);
    expect((await forbiddenApproval.json()).error).toBe('Reviewer role required');
    await page.goto('/editor?mine=1');
    await page.reload();
    await expect(ownWorkRow(page, sessionId!)).toContainText('In review');
    await expect(ownWorkRow(page, sessionId!).getByRole('link', { name: 'View progress', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`submitted-work-${index + 1}.png`), fullPage: true });
    await signOut(page);

    await signInToProtectedPage(page, 'reviewer', sessionPath);
    await sessionDetails(page);
    await expect(page.getByRole('heading', { name: new RegExp(title) })).toBeVisible();
    await expect(page.getByText(finalComment, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Publish transcription', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Approve review', exact: true }).click();
    await expect(page.getByText('Review approved. A publisher can now publish.', { exact: true })).toBeVisible();
    const forbiddenPublication = await request.post(`/api/editor/edit-sessions/${sessionId}/publish`, {
      headers: editor.headers, data: { hopKind: 'editorial_correction' },
    });
    expect(forbiddenPublication.status()).toBe(403);
    expect((await forbiddenPublication.json()).error).toBe('Publisher role required');
    const stillApproved = await request.get(`/api/editor/edit-sessions/${sessionId}`, { headers: editor.headers });
    expect((await stillApproved.json()).session.status).toBe('approved');
    await signOut(page);

    await signInToProtectedPage(page, 'publisher', sessionPath);
    await sessionDetails(page);
    await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Publish transcription', exact: true }).click({ noWaitAfter: true });
    await expect(page).toHaveURL(/(?:published=1|\/account\/step-up\?)/, { timeout: 70_000 });
    if (page.url().includes('/account/step-up')) {
      await page.getByLabel('Authenticator code', { exact: true }).fill(authenticatorCode(process.env.IDENTITY_SEED_TOTP_SECRET ?? 'CAATLASMFASEED22'));
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await sessionDetails(page);
      await page.getByRole('button', { name: 'Publish transcription', exact: true }).click({ noWaitAfter: true });
    }
    await expect(page).toHaveURL(/published=1/, { timeout: 70_000 });
    const versionId = new URL(page.url()).searchParams.get('newVersionId');
    expect(versionId).toBeTruthy();
    expect(versionId).not.toBe(sourceVersionId);
    const href = `/countries/${fixture.countryIso}/versions/${versionId}`;

    // Remove the success query parameters: the link must come from saved state.
    await page.goto(sessionPath);
    await page.reload();
    await sessionDetails(page);
    const resultLink = page.getByRole('link', { name: 'Open published version', exact: true });
    await expect(resultLink).toHaveCount(1);
    await expect(resultLink).toHaveAttribute('href', href);
    await expect(page.getByRole('heading', { name: new RegExp(title) })).toBeVisible();
    await expect(page.locator('.article-list').getByText('draft', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`published-work-${index + 1}.png`), fullPage: true });
    await resultLink.click();
    await page.locator('.version-articles .article-toggle').first().click();
    await expect(page.getByText(correctedText, { exact: true }).first()).toBeVisible();
    published.push({ sessionId: sessionId!, sessionPath, href, versionId: versionId! });
    sourceVersionId = versionId!;
    await signOut(page);
  }

  await signInAsEditor(page, editor);
  await page.goto('/editor?mine=1');
  await page.reload();
  for (const result of published) {
    await expect(ownWorkRow(page, result.sessionId)).toContainText('Published');
  }
  await ownWorkRow(page, published[0].sessionId).getByRole('link', { name: 'View progress', exact: true }).click();
  await page.reload();
  await sessionDetails(page);
  await expect(page.getByRole('link', { name: 'Open published version', exact: true })).toHaveAttribute('href', published[0].href);
  await signOut(page);

  // Check actual anonymous reader bytes: neither historical URL may alias the tip.
  await readPublishedText(page, published[0].href, corrections[0]);
  await expect(page.getByText(corrections[1], { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('archived-first-correction.png'), fullPage: true });
  await readPublishedText(page, published[1].href, corrections[1]);
  await page.screenshot({ path: testInfo.outputPath('current-second-correction.png'), fullPage: true });
  await readPublishedText(page, `/countries/${fixture.countryIso}/versions/${fixture.targetVersionId}`, originalText);
  await page.screenshot({ path: testInfo.outputPath('original-snapshot.png'), fullPage: true });
});

test('dirty text survives canceled brand navigation', async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);
  const fixture = await createIsolatedConstitution(request, `Unsaved text verification charter ${randomUUID()}`);
  await signIn(page, 'editor');
  await startFromViewer(page, fixture.countryIso, fixture.targetVersionId, 'editorial_correction');
  const text = page.locator('#draft-form textarea').first();
  const correctedText = 'A civic duty protects every person. This unsaved wording must remain after canceling navigation.';
  await text.fill(correctedText);
  const unsavedUrl = page.url();
  const leaveWarning = page.waitForEvent('dialog', { timeout: 20_000 }).then(async dialog => {
    expect(dialog.type()).toBe('beforeunload');
    await dialog.dismiss();
  });
  await Promise.all([leaveWarning, page.locator('a.brand').click({ noWaitAfter: true })]);
  await expect(page).toHaveURL(unsavedUrl);
  await expect(text).toHaveValue(correctedText);
  await expect(page.getByRole('button', { name: 'Submit for review', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('unsaved-text-preserved.png'), fullPage: true });
});
