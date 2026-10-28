import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '../fixtures/consent';
import type { Locator, TestInfo } from '@playwright/test';
import { adminHeaders } from './api-fixtures';
import { signIn, startFromViewer } from './auth';

async function json(response: Awaited<ReturnType<APIRequestContext['post']>>) {
  const body = await response.json();
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  return body;
}

async function layoutFixture(request: APIRequestContext) {
  const headers = await adminHeaders(request), noteId = randomUUID(), secondNoteId = randomUUID(), markerId = randomUUID(), secondMarkerId = randomUUID();
  const constitution = await json(await request.post('/api/catalog/countries/XA/constitutions', { headers, data: {
    slug: `layout-${randomUUID()}`, title: 'Compact editor layout acceptance', outline: [
      { kindCode: 'article', displayLabel: 'Article', titlePolicy: 'optional', labelPolicy: 'required', showKind: true, showLabel: true, showTitle: true, allowTextAlongsideChildren: true },
      { kindCode: 'sentence', displayLabel: 'Sentence', titlePolicy: 'optional', labelPolicy: 'optional', showKind: false, showLabel: false, showTitle: false, presentation: 'concatenated', segmentation: 'sentence', sentenceDelimiters: ['.', '!', '?'] },
    ],
  } }));
  const version = await json(await request.post(`/api/catalog/constitutions/${constitution.id}/versions`, { headers, data: { versionLabel: '2020', effectiveDate: '2020-01-01', languageCode: 'en' } }));
  const roots = Array.from({ length: 20 }, (_, index) => ({
    kind: 'article', label: String(index + 1), title: index ? 'Public responsibilities' : 'Human dignity', content: [
      { type: 'child', node: { kind: 'sentence', content: [{ type: 'text', text: `Every person has dignity in Article ${index + 1}.`, ...(index ? {} : { references: [
        { logicalId: markerId, start: 12, end: 12, target: { type: 'footnote', footnoteId: noteId } },
        { logicalId: secondMarkerId, start: 12, end: 12, target: { type: 'footnote', footnoteId: secondNoteId } },
      ] }) }] } },
      { type: 'child', node: { kind: 'sentence', content: [{ type: 'text', text: 'Public institutions respect these rights and remain responsible for their protection across the country and its communities.' }] } },
      ...(index === 19 ? [
        { type: 'text', logicalId: noteId, text: 'Layout acceptance source note.', format: 'footnote', footnoteLabel: '1' },
        { type: 'text', logicalId: secondNoteId, text: 'Second adjacent-marker source note.', format: 'footnote', footnoteLabel: '2' },
      ] : []),
    ],
  }));
  const source = await json(await request.put(`/api/content/versions/${version.id}/content`, { headers, data: { expectedGeneration: 0, roots } }));
  await json(await request.post(`/api/catalog/versions/${version.id}/publish`, { headers }));
  return { versionId: version.id as string, lastRootId: source.roots[19].logicalId as string, noteId };
}

async function withinViewport(locator: Locator, page: Page) {
  const box = await locator.boundingBox(), viewport = page.viewportSize()!;
  expect(box, 'the control must have a rendered box').not.toBeNull();
  expect(box!.x, 'left edge must be visible').toBeGreaterThanOrEqual(-1);
  expect(box!.y, 'top edge must be visible').toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width, 'right edge must be visible').toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height, 'bottom edge must be visible').toBeLessThanOrEqual(viewport.height + 1);
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
  expect(overflow, 'the application must fit its viewport').toBeLessThanOrEqual(1);
}

async function noToolbarOverlap(toolbar: Locator) {
  const boxes = await toolbar.getByRole('button').evaluateAll(buttons => buttons.filter(button => !button.hasAttribute('hidden') && button.getClientRects().length).map(button => {
    const { left, top, right, bottom } = button.getBoundingClientRect();
    return { name: button.getAttribute('aria-label') || button.textContent || '', left, top, right, bottom };
  }));
  for (let first = 0; first < boxes.length; first++) for (let second = first + 1; second < boxes.length; second++) {
    const a = boxes[first], b = boxes[second];
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left), height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    expect(width > 1 && height > 1, `${a.name} and ${b.name} must not overlap`).toBe(false);
  }
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const file = testInfo.outputPath(name + '.png');
  await page.screenshot({ path: file, animations: 'disabled' });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

async function distinctMarkerTargets(container: Locator, page: Page, touch: boolean) {
  for (const [label, body] of [['1', 'Layout acceptance source note.'], ['2', 'Second adjacent-marker source note.']]) {
    const marker = container.getByRole('button', { name: 'Show footnote ' + label, exact: true }).first();
    await marker.scrollIntoViewIfNeeded({ timeout: 15_000 });
    if (touch) await marker.tap({ timeout: 15_000 }); else await marker.click({ timeout: 15_000 });
    const drawer = page.getByRole('dialog', { name: 'Footnote ' + label, exact: true });
    await expect(drawer, 'tapping a visible numeral must open that exact note').toContainText(body);
    await drawer.getByRole('button', { name: 'Close footnote', exact: true }).click();
  }
}

async function auditWorkspace(page: Page) {
  await page.addScriptTag({ path: path.join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => {
    // @ts-expect-error The local axe script is injected for acceptance testing.
    const result = await window.axe.run(document.querySelector('[data-editor-workspace]'));
    return result.violations.map((violation: { id: string; nodes: { target: string[] }[] }) => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }));
  });
  expect(violations, 'editor names, contrast and semantics must pass axe').toEqual([]);
}

for (const viewport of [
  { width: 390, height: 844, touch: true },
  { width: 820, height: 1180, touch: true },
  { width: 1440, height: 1000, touch: false },
]) {
  test.describe(`compact editor at ${viewport.width}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.touch, isMobile: viewport.width === 390 });
    test('keeps document tools, focus expansion, note drawers and independent panels usable', async ({ page, request }, testInfo) => {
      test.setTimeout(180_000);
      const fixture = await layoutFixture(request);
      await signIn(page, 'editor');
      await startFromViewer(page, 'XA', fixture.versionId, 'editorial_correction');
      const fixtureLocation = { width: viewport.width, url: page.url(), versionId: fixture.versionId };
      console.log('Compact editor fixture', JSON.stringify(fixtureLocation));
      await testInfo.attach('fixture-location', { body: JSON.stringify(fixtureLocation, null, 2), contentType: 'application/json' });
      const workspace = page.locator('[data-editor-workspace]'), toolbar = workspace.locator('[data-editor-tools]');
      await expect(workspace).toBeVisible();
      await noHorizontalOverflow(page);
      const initialLayout = await page.evaluate(() => {
        const editor = document.querySelector('#draft-form [role=textbox]')!, toolbar = document.querySelector('[data-editor-tools]')!;
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, { acceptNode: node => node.parentElement?.closest('button') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
        const text = walker.nextNode()!, range = document.createRange(); range.setStart(text, 0); range.setEnd(text, Math.min(1, text.textContent?.length ?? 0));
        const firstText = range.getBoundingClientRect(), tools = toolbar.getBoundingClientRect(), header = document.querySelector('.topbar')!.getBoundingClientRect();
        return { width: window.innerWidth, height: window.innerHeight, firstLegalTextTop: firstText.top, firstLegalTextDocumentTop: firstText.top + window.scrollY, toolbarTop: tools.top, toolbarHeight: tools.height, headerBottom: header.bottom };
      });
      console.log('Compact editor initial layout', JSON.stringify(initialLayout));
      await testInfo.attach('initial-layout-metrics', { body: JSON.stringify(initialLayout, null, 2), contentType: 'application/json' });
      expect(initialLayout.firstLegalTextTop, 'legal text must start within the first 60% of the screen').toBeLessThanOrEqual(viewport.height * .6);
      expect(initialLayout.firstLegalTextTop, 'the toolbar must not cover the first line of legal text').toBeGreaterThanOrEqual(initialLayout.toolbarTop + initialLayout.toolbarHeight - 1);
      await noToolbarOverlap(workspace.locator(':scope > div').first());
      await screenshot(page, testInfo, `editor-${viewport.width}-initial`);
      const hiddenWidth = (await workspace.boundingBox())!.width;
      await page.getByRole('button', { name: 'Show article navigation', exact: true }).click();
      const shownWidth = (await workspace.boundingBox())!.width;
      if (viewport.width >= 900) expect(hiddenWidth - shownWidth).toBeGreaterThan(100);
      else expect(shownWidth).toBeCloseTo(hiddenWidth, 0);
      const session = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Session and publication$/ }) });
      await session.locator('summary').first().click();
      const sessionWidth = (await session.boundingBox())!.width, layoutWidth = (await page.locator('[data-navigation]').boundingBox())!.width;
      expect(sessionWidth, 'the workflow must span the full workspace with navigation open').toBeGreaterThanOrEqual(layoutWidth - 2);
      await noHorizontalOverflow(page); await noToolbarOverlap(session);
      await session.locator('summary').first().click();
      await page.getByRole('button', { name: 'Hide article navigation', exact: true }).click();
      await noHorizontalOverflow(page);

      const editor = workspace.getByRole('textbox', { name: 'Constitution text', exact: true }).first();
      const before = (await editor.boundingBox())!.height;
      await editor.click();
      expect((await editor.boundingBox())!.height, 'focus must give the editing passage more room').toBeGreaterThan(before + 3);
      await noToolbarOverlap(toolbar);
      for (const name of ['Bold', 'Italic', 'Underline', 'Strikethrough', 'Show sentence boundaries', 'Insert', 'Text tools', 'References', 'Unit properties', 'Footnotes']) {
        const tool = toolbar.getByRole('button', { name, exact: true });
        await expect(tool).toBeVisible(); await withinViewport(tool, page);
      }
      await auditWorkspace(page);
      await screenshot(page, testInfo, `editor-${viewport.width}-focus`);
      await distinctMarkerTargets(workspace, page, viewport.touch);

      const marker = workspace.getByRole('button', { name: 'Show footnote 1', exact: true }).first();
      await marker.scrollIntoViewIfNeeded();
      const glyph = await marker.evaluate(element => {
        const range = document.createRange(); range.selectNodeContents(element);
        const box = range.getBoundingClientRect(), style = getComputedStyle(element);
        return { width: box.width, height: box.height, fontSize: Number.parseFloat(style.fontSize), background: style.backgroundColor };
      });
      expect(glyph.height, 'the visible superscript must stay small').toBeLessThanOrEqual(28);
      expect(glyph.width, 'the visible superscript must stay small').toBeLessThanOrEqual(28);
      expect(glyph.fontSize, 'the superscript must not inherit full-size editor text').toBeLessThanOrEqual(14);
      expect(glyph.background, 'reserved touch slots must have no visible button fill').toBe('rgba(0, 0, 0, 0)');
      if (viewport.touch) {
        const hit = await marker.evaluate(element => {
          const box = element.getBoundingClientRect(), pseudo = getComputedStyle(element, '::after');
          const size = (value: string) => Number.parseFloat(value) || 0;
          return { width: Math.max(box.width, size(pseudo.width)), height: Math.max(box.height, size(pseudo.height)) };
        });
        expect(hit.width, 'a transparent touch target must be at least 44px wide').toBeGreaterThanOrEqual(44);
        expect(hit.height, 'a transparent touch target must be at least 44px high').toBeGreaterThanOrEqual(44);
      }
      const scrollBefore = await page.evaluate(() => window.scrollY);
      await marker.click();
      const drawer = page.getByRole('dialog', { name: 'Footnote 1', exact: true });
      await expect(drawer).toContainText('Layout acceptance source note.'); await withinViewport(drawer, page);
      expect(Math.abs(await page.evaluate(() => window.scrollY) - scrollBefore), 'opening a note must preserve reading position').toBeLessThanOrEqual(1);
      await screenshot(page, testInfo, `editor-${viewport.width}-drawer`);
      await drawer.getByRole('button', { name: 'Close footnote', exact: true }).click(); await expect(drawer).toHaveCount(0);
      await marker.click(); await page.keyboard.press('Escape'); await expect(drawer).toHaveCount(0);
      await marker.click(); await workspace.getByRole('button', { name: 'Edit', exact: true }).click(); await expect(drawer).toHaveCount(0);
      await marker.click(); await drawer.getByRole('link', { name: 'Go to footnote', exact: true }).click();
      await expect(drawer).toHaveCount(0); await expect(workspace.locator('#editor-fn-' + fixture.noteId)).toBeInViewport();
      await workspace.getByRole('button', { name: 'Edit footnote 1', exact: true }).click();
      const noteEditor = workspace.getByRole('textbox', { name: 'Footnote text', exact: true });
      await noteEditor.fill('Short note.');
      await workspace.getByRole('button', { name: 'Apply changes', exact: true }).click();
      await expect(noteEditor, 'the first pointer click must apply without the button moving away on blur').toHaveCount(0);
      await expect(workspace.locator('#editor-fn-' + fixture.noteId)).toContainText('Short note.');
      await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect(workspace.locator('#editor-fn-' + fixture.noteId)).toContainText('Layout acceptance source note.');

      await workspace.getByRole('button', { name: 'Preview', exact: true }).click();
      await expect(workspace.locator('.constitution-text')).toHaveCount(20);
      await distinctMarkerTargets(workspace, page, viewport.touch);
      const previewFont = await workspace.locator('.constitution-text').first().evaluate(element => ({ body: getComputedStyle(element).fontFamily, heading: getComputedStyle(element.querySelector('h2')!).fontFamily }));
      await workspace.getByRole('button', { name: 'Edit', exact: true }).click();
      await workspace.locator('[data-editor-unit="' + fixture.lastRootId + '"]').scrollIntoViewIfNeeded();
      await expect(toolbar).toBeInViewport();
      const top = (await toolbar.boundingBox())!.y, headerBottom = await page.locator('.topbar').evaluate(element => element.getBoundingClientRect().bottom);
      expect(top, 'the toolbar must remain below the application header near Article 20').toBeGreaterThanOrEqual(headerBottom - 1);
      expect(top, 'the toolbar must remain at the visible top near Article 20').toBeLessThanOrEqual(headerBottom + 3);
      await noToolbarOverlap(toolbar);
      await toolbar.getByRole('button', { name: 'Footnotes', exact: true }).click();
      await withinViewport(workspace.locator('[data-tool-panel]'), page);
      await toolbar.getByRole('button', { name: 'References', exact: true }).click();
      await expect(page.locator('[data-tool-panel]:visible, [role=menu]:visible')).toHaveCount(1);
      await withinViewport(workspace.locator('[data-tool-panel]'), page);
      await workspace.getByRole('button', { name: 'Close tools', exact: true }).click();
      await screenshot(page, testInfo, `editor-${viewport.width}-article20`);

      await workspace.getByRole('button', { name: 'Wiki', exact: true }).click();
      const wiki = workspace.locator('[data-editor-panel=wiki]');
      await expect(workspace.getByRole('button', { name: 'Undo', exact: true }), 'Wiki must not show unrelated constitutional-text history controls').toHaveCount(0);
      await expect(workspace.getByRole('button', { name: 'Redo', exact: true })).toHaveCount(0);
      await expect(wiki.getByLabel('Short description', { exact: true })).toBeVisible();
      await expect(wiki.getByLabel('Page text', { exact: true })).toBeVisible();
      expect(await wiki.locator('#wiki-sources').evaluate(element => element.closest('details')!.open)).toBe(false);
      expect(await wiki.locator('#wiki-image').evaluate(element => element.closest('details')!.open)).toBe(false);
      await expect(wiki.getByRole('button', { name: 'Save Wiki draft', exact: true })).toBeVisible();
      await noHorizontalOverflow(page); await screenshot(page, testInfo, `editor-${viewport.width}-wiki`);
      await workspace.getByRole('button', { name: 'Details', exact: true }).click();
      const details = workspace.locator('[data-editor-panel=details]');
      await expect(workspace.getByRole('button', { name: 'Undo', exact: true }), 'Details must not show unrelated constitutional-text history controls').toHaveCount(0);
      await expect(workspace.getByRole('button', { name: 'Redo', exact: true })).toHaveCount(0);
      await expect(details.getByLabel('Title', { exact: true })).toBeVisible();
      await expect(details.getByLabel('URL slug', { exact: true })).toBeHidden();
      await details.locator('summary').filter({ hasText: /^Version$/ }).click();
      await expect(details.locator('details[name="constitution-editor-details"][open]')).toHaveCount(1);
      const versionDetails = details.locator('details[name="constitution-editor-details"][open]');
      await expect(versionDetails.locator('summary').first()).toHaveText('Version');
      await expect(versionDetails.getByRole('textbox')).toHaveCount(0);
      await noHorizontalOverflow(page); await screenshot(page, testInfo, `editor-${viewport.width}-details`);

      await page.goto(`/countries/XA/versions/${fixture.versionId}`);
      const readerFont = await page.locator('.version-articles').evaluate(element => ({ body: getComputedStyle(element).fontFamily, heading: getComputedStyle(element.querySelector('h2')!).fontFamily }));
      expect(readerFont, 'viewer and preview must use the same document typography').toEqual(previewFont);
      await page.getByRole('button', { name: 'Full text', exact: true }).click();
      await distinctMarkerTargets(page.locator('main'), page, viewport.touch);
      await noHorizontalOverflow(page);
      await screenshot(page, testInfo, `viewer-${viewport.width}`);
    });
  });
}

test.describe('compact editor in a short viewport at 200% zoom-equivalent reflow', () => {
  test.use({ viewport: { width: 720, height: 430 } });
  test('keeps every tool panel inside the available screen height', async ({ page, request }, testInfo) => {
    test.setTimeout(120_000);
    const fixture = await layoutFixture(request);
    await signIn(page, 'editor');
    await startFromViewer(page, 'XA', fixture.versionId, 'editorial_correction');
    const workspace = page.locator('[data-editor-workspace]'), toolbar = workspace.locator('[data-editor-tools]');
    await expect(toolbar).toBeVisible();
    for (const name of ['Insert', 'Text tools', 'References', 'Unit properties', 'Footnotes', 'Editor view']) {
      await toolbar.getByRole('button', { name, exact: true }).click();
      const panel = workspace.locator('[data-tool-panel]');
      await expect(panel).toBeVisible();
      await withinViewport(panel, page);
      await withinViewport(panel.getByRole('button', { name: 'Close tools', exact: true }), page);
      if (name === 'Insert') {
        const lastAction = panel.getByRole('button').last();
        await expect(lastAction).toBeEnabled();
        await lastAction.scrollIntoViewIfNeeded();
        await lastAction.click({ trial: true });
        await page.setViewportSize({ width: 720, height: 360 });
        await expect.poll(async () => { const box = await panel.boundingBox(); return box!.y + box!.height; }, { message: 'an open tool panel must adapt when the viewport becomes shorter' }).toBeLessThanOrEqual(361);
        await lastAction.scrollIntoViewIfNeeded();
        await lastAction.click({ trial: true });
        await panel.evaluate(element => element.scrollTo(0, 0));
        await page.setViewportSize({ width: 720, height: 430 });
        await withinViewport(panel, page);
        await workspace.getByRole('button', { name: /^Changes \(/ }).focus();
        await page.keyboard.press('Enter');
        await expect(toolbar).toHaveCount(0);
        await workspace.getByRole('button', { name: 'Edit', exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(panel).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect.poll(async () => { const box = await panel.boundingBox(); return box!.y + box!.height; }, { message: 'returning to Edit must measure the remounted open panel' }).toBeLessThanOrEqual(431);
        await withinViewport(panel, page);
      }
      if (name === 'Editor view') {
        const lastArticle = panel.getByRole('button').last();
        await lastArticle.scrollIntoViewIfNeeded();
        await lastArticle.click({ trial: true });
        await panel.evaluate(element => element.scrollTo(0, 0));
      }
      await noHorizontalOverflow(page);
      await screenshot(page, testInfo, `editor-720-short-${name.toLowerCase().replaceAll(' ', '-')}`);
      await panel.getByRole('button', { name: 'Close tools', exact: true }).click();
    }
  });
});
