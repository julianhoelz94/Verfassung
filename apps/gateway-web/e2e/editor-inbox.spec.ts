import { test, expect } from './fixtures/consent';
import { signInEditor, signInReviewer, startEditorSession, VERSION_1949, VERSION_2022 } from './helpers';
import path from 'node:path';

const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
const owner = '01900000-0000-4000-8000-000000000410';
const seeded = (id: number, status = 'open') => ({
  id: `01900000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  versionId: VERSION_1949, openedBy: owner, openedAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z', status, changedArticleCount: 1, hopKind: 'editorial_correction',
});
test.beforeEach(async ({ request }) => { await request.post(`${mock}/__reset`); });

test('live filters, removable chips and progress actions keep the inbox focused', async ({ page, request }) => {
  await request.post(`${mock}/__editor_sessions`, { data: { sessions: [seeded(1001), seeded(1002, 'reviewing'), seeded(1003, 'approved')] } });
  await signInEditor(page);
  await expect(page.locator('.editor-session-list li')).toHaveCount(3);
  await expect(page.getByRole('navigation', { name: 'Editorial tools' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tools', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('reviewing');
  await expect(page.locator('.editor-session-list li')).toHaveCount(1);
  await expect(page.locator('.editor-session-list').getByRole('link', { name: 'View progress', exact: true })).toBeVisible();
  await expect(page.locator('.editor-session-list').getByRole('link', { name: 'Continue editing', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Remove filter:/ }).click();
  await expect(page.locator('.editor-session-list li')).toHaveCount(3);
  await page.getByRole('searchbox', { name: 'Search your work', exact: true }).fill('no matching constitution');
  await expect(page.getByRole('heading', { name: 'No matching work', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search and filters', exact: true }).click();
  await expect(page.locator('.editor-session-list li')).toHaveCount(3);
});

test('returning from saved work restores filters, expanded pages, row focus and scroll', async ({ page, request }) => {
  await signInEditor(page);
  await startEditorSession(page, VERSION_2022, 'editorial_correction');
  const session = new URL(page.url()).searchParams.get('sessionId')!;
  const extra = Array.from({ length: 100 }, (_, index) => ({ ...seeded(index + 2000), versionId: VERSION_2022, updatedAt: '2030-01-01T00:00:00Z' }));
  await request.post(`${mock}/__editor_sessions`, { data: { sessions: extra } });
  await page.goto('/editor?mine=1');
  await page.getByRole('searchbox', { name: 'Search your work', exact: true }).fill('2022');
  for (let index = 0; index < 5; index++) await page.getByRole('button', { name: 'Show 20 more', exact: true }).click();
  await expect(page.locator('.editor-session-list li')).toHaveCount(101);
  const action = page.locator(`[data-work-id="${session}"]`).getByRole('link', { name: 'Continue editing', exact: true });
  await action.scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => scrollY);
  await action.click();
  await expect(page.getByRole('navigation', { name: 'Work queues', exact: true })).toBeVisible();
  await page.getByLabel('What was corrected in this transcription?').fill('Retained correction rationale.');
  await page.getByRole('button', { name: 'Hide context', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Work context', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Show context', exact: true }).click();
  await expect(page.getByLabel('What was corrected in this transcription?')).toHaveValue('Retained correction rationale.');
  await page.getByRole('button', { name: 'Save comment', exact: true }).click();
  await expect(page).toHaveURL(/detailsSaved=1/);
  await page.getByRole('link', { name: /^Back to My work$/ }).click();
  await expect(page.getByRole('searchbox', { name: 'Search your work', exact: true })).toHaveValue('2022');
  await expect(page.locator('.editor-session-list li')).toHaveCount(101);
  await expect(action).toBeFocused();
  expect(Math.abs(await page.evaluate(() => scrollY) - scroll)).toBeLessThan(20);
});

test('partial service failures preserve available work and never masquerade as an empty inbox', async ({ page, request }) => {
  await request.post(`${mock}/__editor_sessions`, { data: { sessions: [seeded(3001)], importsUnavailable: true } });
  await signInEditor(page);
  await expect(page.locator('.editor-session-list li')).toHaveCount(1);
  await expect(page.getByRole('alert').filter({ hasText: 'Imports couldn’t be loaded' })).toContainText('Imports couldn’t be loaded');
  await request.post(`${mock}/__editor_sessions`, { data: { sessions: [], importsUnavailable: true } });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Some work couldn’t be loaded', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start with a constitution', exact: true })).toHaveCount(0);
  await request.post(`${mock}/__editor_sessions`, { data: { sessions: [], importsUnavailable: true, unavailable: true } });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your work couldn’t be loaded', exact: true })).toBeVisible();
  await request.post(`${mock}/__editor_sessions`, { data: { sessions: [] } });
  await page.getByRole('link', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Start with a constitution', exact: true })).toBeVisible();
});

test('a copied workspace link retains its explicit return filters through a save', async ({ page }) => {
  await signInEditor(page);
  await startEditorSession(page, VERSION_2022, 'editorial_correction');
  const workspace = page.url(), returnTo = '/editor?mine=1&query=2022&kind=correction';
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${workspace}&inbox=${encodeURIComponent(returnTo)}`);
  await page.getByLabel('What was corrected in this transcription?').fill('Checked the copied workspace against the source.');
  await page.getByRole('button', { name: 'Save comment', exact: true }).click();
  await expect(page).toHaveURL(/detailsSaved=1/);
  await page.getByRole('link', { name: /^Back to My work$/ }).click();
  await expect(page.getByRole('searchbox', { name: 'Search your work', exact: true })).toHaveValue('2022');
  await expect(page.getByRole('button', { name: /^Remove filter: Text correction$/ })).toBeVisible();
});

test('reviewer-only navigation opens the authorised queue without personal editing actions', async ({ page }) => {
  await signInReviewer(page);
  const navigation = page.getByRole('navigation', { name: 'Work queues', exact: true });
  await expect(navigation.getByRole('link')).toHaveCount(1);
  await expect(navigation.getByRole('link', { name: 'Review', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: 'Continue editing', exact: true })).toHaveCount(0);
});

for (const width of [390, 1440]) test(`the structured canvas keeps its compact first view and sticky tools at ${width}px`, async ({ page, request }, info) => {
  const height = width === 390 ? 844 : 1000;
  await page.setViewportSize({ width, height });
  await request.post(`${mock}/__continuous_reader`);
  await signInEditor(page);
  await startEditorSession(page, VERSION_2022, 'editorial_correction');
  const editor = page.locator('#draft-form [role="textbox"]').first();
  await expect(editor).toBeVisible();
  const firstLine = await page.locator('#draft-form [data-constitution-document]').first().evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, { acceptNode: node => node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    const text = walker.nextNode()!, range = document.createRange();
    range.setStart(text, 0); range.setEnd(text, Math.min(1, text.textContent?.length ?? 0));
    return range.getBoundingClientRect().top;
  });
  await page.screenshot({ path: info.outputPath('structured-initial.png') });
  expect(firstLine, 'the first legal unit starts within the first 60% of the viewport').toBeLessThanOrEqual(height * .6);
  await editor.scrollIntoViewIfNeeded();
  const toolbar = page.locator('[data-editor-tools]'), queue = page.locator('[data-work-collection-menu]');
  expect((await toolbar.boundingBox())!.y).toBeGreaterThanOrEqual((await queue.boundingBox())!.y + (await queue.boundingBox())!.height - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('open canvas tools fit after a short viewport resize and keep article navigation accessible', async ({ page, request }) => {
  await page.setViewportSize({ width: 720, height: 430 });
  await request.post(`${mock}/__continuous_reader`);
  await signInEditor(page);
  await startEditorSession(page, VERSION_2022, 'editorial_correction');
  const workspace = page.locator('[data-editor-workspace]'), tools = workspace.locator('[data-editor-tools]');
  await tools.getByRole('button', { name: 'Insert', exact: true }).click();
  const panel = workspace.locator('[data-tool-panel]'), action = panel.getByRole('button').last();
  await action.scrollIntoViewIfNeeded();
  await page.setViewportSize({ width: 720, height: 360 });
  await expect.poll(async () => { const box = (await panel.boundingBox())!; return box.y + box.height; }).toBeLessThanOrEqual(361);
  await action.scrollIntoViewIfNeeded();
  await action.click({ trial: true });
  await panel.evaluate(element => element.scrollTo(0, 0));
  await page.setViewportSize({ width: 720, height: 430 });
  await workspace.getByRole('button', { name: /^Changes \(/ }).focus();
  await page.keyboard.press('Enter');
  await expect(tools).toHaveCount(0);
  await workspace.getByRole('button', { name: 'Edit', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  await page.evaluate(() => scrollTo(0, 0));
  await expect.poll(async () => { const box = (await panel.boundingBox())!; return box.y + box.height; }).toBeLessThanOrEqual(431);
  await panel.getByRole('button', { name: 'Close tools', exact: true }).click();
  await page.getByRole('button', { name: 'Show article navigation', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Top-level units', exact: true })).toBeVisible();
  await page.addScriptTag({ path: path.join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => (await (window as unknown as { axe: { run: (node: Document) => Promise<{ violations: { id: string }[] }> } }).axe.run(document)).violations.map(v => v.id));
  expect(violations).toEqual([]);
});

for (const locale of ['en', 'de']) for (const width of [390, 850, 1440]) {
  test(`inbox and focused queue bar remain usable in ${locale} at ${width}px`, async ({ page, request }, info) => {
    await page.setViewportSize({ width, height: 950 });
    await request.post(`${mock}/__visual_roles`);
    await request.post(`${mock}/__editor_sessions`, { data: { sessions: [seeded(4001), seeded(4002, 'reviewing')] } });
    await signInEditor(page);
    await startEditorSession(page, VERSION_2022, 'editorial_correction');
    const href = page.url();
    await request.put(`${mock}/api/identity/me/language`, { headers: { Authorization: 'Bearer e2e-session-token' }, data: { languagePreference: locale } });
    await page.setExtraHTTPHeaders({ 'Accept-Language': locale });
    await page.goto('/editor?mine=1');
    for (const target of ['/editor?mine=1', href]) {
      await page.goto(target);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      const navigation = page.getByRole('navigation', { name: locale === 'de' ? 'Arbeitslisten' : 'Work queues', exact: true });
      await expect(navigation.getByRole('link')).toHaveCount(3);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.addScriptTag({ path: path.join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
      const violations = await page.evaluate(async () => (await (window as unknown as { axe: { run: (node: Document) => Promise<{ violations: { id: string }[] }> } }).axe.run(document)).violations.map(v => v.id));
      expect(violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(target === href ? 'workspace.png' : 'inbox.png'), fullPage: true });
    }
  });
}
