import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '../fixtures/consent';
import type { Locator } from '@playwright/test';
import { adminHeaders } from './api-fixtures';
import { signIn, signOut, startFromViewer } from './auth';

async function json(response: Awaited<ReturnType<APIRequestContext['post']>>) {
  const result = await response.json();
  expect(response.ok(), JSON.stringify(result)).toBeTruthy(); return result;
}
function textCanvas(canvas: Locator, entryId: string) {
  return canvas.locator(`[role="textbox"]:has([data-editor-entry="${entryId}"])`);
}
function unitCanvas(canvas: Locator, unitId: string) {
  return canvas.locator(`[role="textbox"]:has([data-unit="${unitId}"])`);
}
async function selectBodyText(canvas: Locator, end = 0) {
  await canvas.focus();
  await canvas.locator('span.ce-sentence').first().evaluate((element, end) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, { acceptNode: node => node.parentElement?.closest('button') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const text = walker.nextNode();
    if (!text) throw new Error('The sentence has no body text to select');
    const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, end);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }, end);
}
async function expectWordingChange(canvas: Locator) {
  const changes = canvas.getByRole('region', { name: 'Changes', exact: true });
  await expect(changes.getByText('Before', { exact: true })).toBeVisible();
  await expect(changes.getByText('Original wording.', { exact: true })).toBeVisible();
  await expect(changes.getByText('After', { exact: true })).toBeVisible();
  await expect(changes.getByText('Changed wording.', { exact: true })).toBeVisible();
}
async function setScope(page: Page, scope: string) {
  await page.getByRole('button', { name: 'Editor view', exact: true }).click();
  const select = page.getByRole('combobox', { name: 'Editor view', exact: true });
  await expect(select).toBeEnabled();
  await select.selectOption(scope);
  await expect(page.locator('#draft-form input[name="scope"]')).toHaveValue(scope);
}
async function sessionDetails(page: Page) {
  const summary = page.getByText('Session and publication', { exact: true });
  if (!(await summary.evaluate(element => element.parentElement!.hasAttribute('open')))) await summary.click();
}
async function properties(page: Page, canvas: Locator, unitId: string) {
  await canvas.locator(`[data-unit="${unitId}"]`).click();
  await canvas.getByRole('button', { name: 'Unit properties', exact: true }).click();
}
async function fixture(request: APIRequestContext, single = false, delimiters = ['.', '!', '?'], sharedFootnote = false) {
  const headers = await adminHeaders(request);
  const outline = single ? [{ kindCode: 'clause', displayLabel: 'Clause', titlePolicy: 'none', labelPolicy: 'required', segmentation: 'plain' }] : [
    { kindCode: 'article', displayLabel: 'Article', allowTextAlongsideChildren: true, titlePolicy: 'required', labelPolicy: 'required' },
    { kindCode: 'sentence', displayLabel: 'Sentence', segmentation: 'sentence', sentenceDelimiters: delimiters, presentation: 'concatenated', labelPolicy: 'optional', titlePolicy: 'optional' },
  ];
  const constitution = await json(await request.post('/api/catalog/countries/XA/constitutions', { headers, data: { slug: `structured-${randomUUID()}`, title: `Structured journey ${randomUUID()}`, outline } }));
  const version = await json(await request.post(`/api/catalog/constitutions/${constitution.id}/versions`, { headers, data: { versionLabel: '2020', effectiveDate: '2020-01-01', languageCode: 'en' } }));
  const roots = single ? [{ kind: 'clause', label: 'bis', content: [{ type: 'text', text: 'Plain custom root.' }] }] : [{ kind: 'article', label: '46a', title: 'Rights', content: [
    { type: 'text', text: 'Before.' },
    { type: 'child', node: { kind: 'sentence', label: '(2a)', title: 'Sentence title', content: [{ type: 'text', text: 'Original wording.' }] } },
    { type: 'text', text: 'Between.' },
    { type: 'child', node: { kind: 'sentence', label: null, title: null, content: [{ type: 'text', text: 'Untouched branch.' }] } },
    { type: 'text', text: 'After.' },
  ] }];
  const noteId = randomUUID();
  const contentRoots = sharedFootnote ? [{ ...roots[0], content: roots[0].content.map((entry, index) => index === 0 ? { ...entry, references: [{ logicalId: randomUUID(), start: 7, end: 7, target: { type: 'footnote', footnoteId: noteId } }] } : entry) }, { kind: 'article', label: '47', title: 'Shared footnotes', content: [{ type: 'text', text: 'Second article.' }, { type: 'text', logicalId: noteId, format: 'footnote', footnoteLabel: 'a', text: 'Shared source note.' }] }] : roots;
  const source = await json(await request.put(`/api/content/versions/${version.id}/content`, { headers, data: { expectedGeneration: 0, roots: contentRoots } }));
  await json(await request.post(`/api/catalog/versions/${version.id}/publish`, { headers }));
  return { headers, constitution, version, source };
}
for (const hop of ['editorial_correction', 'legal'] as const) {
  test(`ordered ${hop} preserves historical units and shares unchanged branches`, async ({ page, request }) => {
    test.setTimeout(180_000);
    const { version, source, headers, constitution } = await fixture(request);
    const sourceRoot = source.roots[0], sourceSentence = sourceRoot.content[1].node;
    await signIn(page, 'editor');
    await startFromViewer(page, 'XA', version.id, hop);
    await expect(page.locator('#draft-form input[name="scope"]')).toHaveValue('article');
    const canvas = page.locator('[data-editor-workspace]');
    await expect(textCanvas(canvas, sourceRoot.content[0].logicalId)).toContainText('Before.');
    await setScope(page, 'sentence');
    await expect(textCanvas(canvas, sourceRoot.content[0].logicalId)).toHaveCount(0);
    await expect(unitCanvas(canvas, sourceSentence.logicalId)).toContainText('Original wording.');
    await unitCanvas(canvas, sourceSentence.logicalId).fill('Changed wording.');
    await expect(page.getByRole('button', { name: 'Submit for review' })).toBeDisabled();
    await setScope(page, 'constitution');
    await expect(textCanvas(canvas, sourceRoot.content[0].logicalId)).toContainText('Before.');
    await setScope(page, 'article');
    await expect(unitCanvas(canvas, sourceSentence.logicalId)).toContainText('Changed wording.');
    await canvas.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
    await canvas.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(canvas).toContainText('Changed wording.');
    await page.reload();
    await expect(unitCanvas(canvas, sourceSentence.logicalId)).toContainText('Changed wording.');
    await canvas.getByRole('button', { name: /^Changes \(/ }).click();
    await expectWordingChange(canvas);
    const sessionId = new URL(page.url()).searchParams.get('sessionId');
    const draft = await json(await request.get(`/api/editor/edit-sessions/${sessionId}/structured-draft`, { headers }));
    expect(draft.operations).toHaveLength(1);
    expect(draft.operations[0].type).toBe('replace_text');
    expect(draft.roots[0].content[3].node.revisionId).toBe(sourceRoot.content[3].node.revisionId);
    await sessionDetails(page);
    if (hop === 'legal') {
      await page.getByLabel('Session').getByLabel('Title', { exact: true }).fill('Structured law');
      await page.getByLabel('Comment', { exact: true }).fill('Changed one sentence.');
      await page.getByLabel('Document URL').fill('https://example.org/structured-law.pdf');
      await page.getByLabel('Before unit').selectOption(sourceSentence.logicalId);
      await page.getByLabel('Draft after unit').selectOption(sourceSentence.logicalId);
      await page.getByRole('button', { name: 'Save change record' }).click();
      await expect(page.getByText('Publish details saved.')).toBeVisible();
      await sessionDetails(page);
      const sessionId = new URL(page.url()).searchParams.get('sessionId');
      const review = await json(await request.get(`/api/editor/edit-sessions/${sessionId}/diff-review`, { headers }));
      const queue = page.getByRole('region', { name: 'Review differences' });
      await expect(queue.getByText(`Reviewed 0 of ${review.candidates.length}`)).toBeVisible();
      for (let index = 0; index < review.candidates.length; index++) {
        await queue.getByLabel('Reason for exclusion').fill('Journey fixture tracks the sentence node as its change row.');
        await queue.getByRole('button', { name: 'Exclude with reason and next' }).click();
        await expect.poll(async () => {
          const current = await json(await request.get(`/api/editor/edit-sessions/${sessionId}/diff-review`, { headers }));
          return current.decisions.filter((decision: { status: string }) => decision.status === 'excluded_with_reason').length;
        }).toBe(index + 1);
      }
      await page.reload();
      await expect(page.getByRole('button', { name: 'Submit for review' })).toBeEnabled({ timeout: 15_000 });
    } else {
      await page.getByLabel('What was corrected in this transcription?').fill('Corrected one sentence.');
      await page.getByRole('button', { name: 'Save comment' }).click();
    }
    await page.getByRole('button', { name: 'Submit for review' }).click();
    const sessionUrl = page.url();
    await signOut(page); await signIn(page, 'reviewer'); await page.goto(sessionUrl);
    await canvas.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(unitCanvas(canvas, sourceSentence.logicalId)).toHaveAttribute('contenteditable', 'false');
    await canvas.getByRole('button', { name: /^Changes \(/ }).click();
    await expectWordingChange(canvas);
    if (hop === 'legal') {
      await sessionDetails(page);
      const queue = page.getByRole('region', { name: 'Review differences' });
      const sessionId = new URL(page.url()).searchParams.get('sessionId');
      const review = await json(await request.get(`/api/editor/edit-sessions/${sessionId}/diff-review`, { headers }));
      for (let index = 0; index < review.candidates.length; index++) {
        await queue.getByLabel('Acknowledge this exclusion for publication').check();
        await queue.getByRole('button', { name: 'Exclude with reason and next' }).click();
        await expect(queue.getByText('Decision saved.')).toBeVisible();
      }
      await expect(queue.getByText(`Reviewed ${review.candidates.length} of ${review.candidates.length}`)).toBeVisible();
    }
    await page.getByRole('button', { name: 'Approve review' }).click();
    await signOut(page); await signIn(page, 'publisher'); await page.goto(sessionUrl);
    await sessionDetails(page);
    await page.getByRole('button', { name: hop === 'legal' ? 'Publish new legal version' : 'Publish transcription' }).click();
    await expect(page).toHaveURL(/published=1/, { timeout: 15_000 });
    const targetId = new URL(page.url()).searchParams.get('newVersionId');
    const target = await json(await request.get(`/api/content/versions/${targetId}/content`));
    const historical = await json(await request.get(`/api/content/versions/${version.id}/content`));
    expect(historical).toEqual(source);
    const targetRoot = target.roots[0];
    expect(targetRoot.content[0].revisionId).toBe(sourceRoot.content[0].revisionId);
    expect(targetRoot.content[3].node.revisionId).toBe(sourceRoot.content[3].node.revisionId);
    expect(targetRoot.content[1].node.content[0].text).toBe('Changed wording.');
    expect(targetRoot.content[1].node.logicalId).toBe(sourceSentence.logicalId);
    const immutable = await request.put(`/api/content/versions/${version.id}/content`, { headers, data: { expectedGeneration: source.generation, roots: [] } });
    expect(immutable.status()).toBe(409);
    await page.goto(`/countries/XA/versions/${version.id}/units/${sourceRoot.occurrenceId}`);
    await expect(page.locator('main').last()).toContainText('Original wording.');
    await page.goto(`/countries/XA/versions/${targetId}/units/${targetRoot.occurrenceId}`);
    await expect(page.locator('main').last()).toContainText('Changed wording.');
    await expect(page.locator('main').last()).toContainText('Before.');
    await expect(page.locator('main').last()).toContainText('Between.');
    await expect(page.locator('main').last()).toContainText('After.');
    const rendered = await page.locator('main').last().innerText();
    const positions = ['Before.', 'Changed wording.', 'Between.', 'Untouched branch.', 'After.'].map(text => rendered.indexOf(text));
    expect(positions.every(position => position >= 0)).toBeTruthy();
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    await expect.poll(async () => {
      const found = await json(await request.get(`/api/search/search?q=Changed%20wording&versionId=${targetId}`));
      return found.total;
    }, { timeout: 30_000 }).toBeGreaterThan(0);
    const originalSearch = await json(await request.get(`/api/search/search?q=Changed%20wording&versionId=${version.id}`));
    expect(originalSearch.total).toBe(0);
    if (hop === 'legal') {
      const laws = await json(await request.get(`/api/amendment/constitutions/${constitution.id}/amendments`));
      expect(laws).toHaveLength(1);
      expect(laws[0].sourceVersionId).toBe(version.id);
      expect(laws[0].targetVersionId).toBe(targetId);
      await page.goto(`/countries/XA/compare?from=${version.id}&to=${targetId}&all=1`);
      await expect(page.locator('main').last()).toContainText('Original wording.');
      await expect(page.locator('main').last()).toContainText('Changed wording.');
      await expect(page.locator('main').last()).toContainText('Between.');
    }
  });
}

test('custom one-level root supports literal labels, plain text and new root navigation', async ({ page, request }) => {
  const { version, source } = await fixture(request, true);
  await signIn(page, 'editor');
  await startFromViewer(page, 'XA', version.id, 'editorial_correction');
  const canvas = page.locator('[data-editor-workspace]');
  await expect(canvas.locator('input[name="scope"]')).toHaveValue('clause');
  await properties(page, canvas, source.roots[0].logicalId);
  await expect(canvas.getByLabel('Clause title')).toHaveCount(0);
  await canvas.getByLabel('Clause literal label').fill('');
  await unitCanvas(canvas, source.roots[0].logicalId).fill('Custom root changed.');
  await expect(canvas.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  await canvas.getByLabel('Clause literal label').fill('(2a)');
  await canvas.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
  await canvas.getByRole('button', { name: 'Insert', exact: true }).click();
  await canvas.getByRole('button', { name: 'Add top-level unit · Clause', exact: true }).click();
  await canvas.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByRole('button', { name: 'Show article navigation', exact: true }).click();
  await page.getByRole('link', { name: 'Clause New label' }).click();
  await canvas.getByRole('button', { name: 'Unit properties', exact: true }).click();
  await expect(canvas.getByLabel('Clause literal label')).toHaveValue('New label');
  await canvas.getByLabel('Clause literal label').fill('bis');
  await canvas.getByRole('textbox', { name: 'Constitution text', exact: true }).fill('New root text.');
  await canvas.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.reload();
  await expect(canvas.getByRole('textbox', { name: 'Constitution text', exact: true })).toContainText('New root text.');
});

test('mixed parent text and nested sentence decisions reopen when one draft unit changes', async ({ page, request }) => {
  test.setTimeout(120_000);
  const { version, headers, source } = await fixture(request);
  await signIn(page, 'editor');
  await startFromViewer(page, 'XA', version.id, 'legal');
  const canvas = page.locator('[data-editor-workspace]');
  const firstEntry = source.roots[0].content[0].logicalId, firstSentence = source.roots[0].content[1].node.logicalId;
  await textCanvas(canvas, firstEntry).fill('Before, revised.');
  await unitCanvas(canvas, firstSentence).fill('Nested right revised.');
  await properties(page, canvas, firstSentence);
  await canvas.getByRole('button', { name: 'Move unit earlier', exact: true }).click();
  await canvas.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
  const sessionId = new URL(page.url()).searchParams.get('sessionId');
  const endpoint = `/api/editor/edit-sessions/${sessionId}/diff-review`;
  const initial = await json(await request.get(endpoint, { headers }));
  expect(initial.candidates.length).toBeGreaterThanOrEqual(2);
  expect(initial.candidates.map((candidate: { facet: string }) => candidate.facet)).toContain('move');
  await sessionDetails(page);
  const queue = page.getByRole('region', { name: 'Review differences' });
  await expect(queue.getByText(`Reviewed 0 of ${initial.candidates.length}`)).toBeVisible();
  for (let index = 0; index < initial.candidates.length; index++) {
    await expect(queue.getByText(`Difference ${index + 1} of ${initial.candidates.length}`)).toBeVisible();
    const reason = queue.getByLabel('Reason for exclusion');
    await expect(reason).toHaveValue('');
    await reason.fill('Covered by the separately checked change record.');
    const exclude = queue.getByRole('button', { name: 'Exclude with reason and next' });
    await expect(exclude).toBeEnabled();
    await exclude.click();
    await expect.poll(async () => {
      const saved = await json(await request.get(endpoint, { headers }));
      return saved.decisions.filter((decision: { status: string }) => decision.status === 'excluded_with_reason').length;
    }).toBe(index + 1);
    await expect(queue.getByRole('button', { name: 'Refresh' })).toBeEnabled({ timeout: 20_000 });
  }
  const proposed = await json(await request.get(endpoint, { headers }));
  expect(proposed.decisions.filter((decision: { status: string }) => decision.status === 'excluded_with_reason')).toHaveLength(initial.candidates.length);
  await textCanvas(canvas, firstEntry).fill('Before, revised again.');
  await canvas.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
  const revised = await json(await request.get(endpoint, { headers }));
  expect(revised.decisions.some((decision: { status: string }) => decision.status === 'needs_recheck')).toBeTruthy();
  await page.reload();
  await sessionDetails(page);
  await expect(page.getByRole('region', { name: 'Review differences' }).getByText(/\d+ need recheck/)).toBeVisible();
});


test('pasted boundaries, inline titles and keyboard edits persist with explicit lineage', async ({ page, request }) => {
  const { version, headers, source } = await fixture(request);
  await signIn(page, 'editor');
  await startFromViewer(page, 'XA', version.id, 'editorial_correction');
  const canvas = page.locator('[data-editor-workspace]');
  const pasted = 'Art.12 applies. Next! ';
  const original = source.roots[0].content[1].node;
  const sentence = unitCanvas(canvas, original.logicalId);
  await sentence.fill(pasted);
  await expect(sentence).toBeFocused();
  await expect(sentence.locator('span.ce-sentence')).toHaveCount(2);
  await expect(sentence.locator('span.ce-sentence').nth(0)).toContainText('Art.12 applies. ');
  await expect(sentence.locator('span.ce-sentence').nth(1)).toHaveText('Next! ');
  await properties(page, canvas, original.logicalId);
  await canvas.getByLabel('Sentence title').fill('Inline title');
  await canvas.getByRole('button', { name: 'Close tools', exact: true }).click();
  await canvas.locator(`[data-unit="${original.logicalId}"]`).click();
  await selectBodyText(sentence);
  await canvas.getByRole('button', { name: 'Text tools', exact: true }).click();
  await canvas.getByRole('button', { name: 'Merge with next sentence', exact: true }).click();
  await expect(sentence.locator('span.ce-sentence')).toHaveCount(1);
  await expect(sentence).toContainText(pasted.trim());
  await canvas.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(unitCanvas(canvas, original.logicalId)).toContainText(pasted.trim());
  await properties(page, canvas, original.logicalId);
  await expect(canvas.getByLabel('Sentence title')).toHaveValue('Inline title');
  const sessionId = new URL(page.url()).searchParams.get('sessionId');
  const draft = await json(await request.get(`/api/editor/edit-sessions/${sessionId}/structured-draft`, { headers }));
  expect(draft.operations.map((operation: { type: string }) => operation.type)).toEqual(expect.arrayContaining(['split_text', 'merge_text', 'insert_child', 'move']));
  const split = draft.operations.find((operation: { type: string }) => operation.type === 'split_text');
  const merged = draft.operations.find((operation: { type: string }) => operation.type === 'merge_text');
  expect(split.parts[0].logicalId).toBe(original.content[0].logicalId);
  expect(merged.mergeIds).toEqual(split.parts.map((part: { logicalId: string }) => part.logicalId));
  expect(merged.parts[0].logicalId).toBe(original.content[0].logicalId);
  expect(draft.roots[0].content.map((entry: { type: string }) => entry.type)).toEqual(['text', 'child', 'text', 'child', 'text']);
  expect(await json(await request.get(`/api/content/versions/${version.id}/content`))).toEqual(source);
});

test('configured delimiters, all inline styles and undo/redo survive saving and reopening', async ({ page, request }) => {
  const { version, headers, source } = await fixture(request, false, [';']);
  const original = source.roots[0].content[1].node;
  await signIn(page, 'editor');
  await startFromViewer(page, 'XA', version.id, 'editorial_correction');
  const canvas = page.locator('[data-editor-workspace]'), sentence = unitCanvas(canvas, original.logicalId);
  const undo = canvas.getByRole('button', { name: 'Undo', exact: true }), redo = canvas.getByRole('button', { name: 'Redo', exact: true });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await sentence.fill('Styled phrase; More remains. Final;');
  await expect(sentence.locator('span.ce-sentence')).toHaveCount(2);
  await expect(sentence.locator('span.ce-sentence').nth(1)).toHaveText('More remains. Final;');
  await selectBodyText(sentence, 'Styled'.length);
  for (const name of ['Bold', 'Italic', 'Underline', 'Strikethrough']) await canvas.getByRole('button', { name, exact: true }).click();
  for (const selector of ['strong', 'em', 'u', 's']) await expect(sentence.locator(selector).first()).toContainText('Styled');
  const formatted = await canvas.locator('input[name="structuredDraft"]').inputValue();
  await undo.click();
  await expect(redo).toBeEnabled();
  await expect(canvas.locator('input[name="structuredDraft"]')).not.toHaveValue(formatted);
  await redo.click();
  await expect(canvas.locator('input[name="structuredDraft"]')).toHaveValue(formatted);
  await canvas.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
  await page.reload();
  for (const selector of ['strong', 'em', 'u', 's']) await expect(unitCanvas(canvas, original.logicalId).locator(selector).first()).toContainText('Styled');
  const sessionId = new URL(page.url()).searchParams.get('sessionId');
  const saved = await json(await request.get(`/api/editor/edit-sessions/${sessionId}/structured-draft`, { headers }));
  const sentences = saved.roots[0].content.filter((entry: { node?: { kind: string } }) => entry.node?.kind === 'sentence').map((entry: { node: { logicalId: string; content: { text: string; marks?: { type: string }[] }[] } }) => entry.node);
  expect(sentences.map((node: { content: { text: string }[] }) => node.content[0].text)).toEqual(['Styled phrase;', 'More remains. Final;', 'Untouched branch.']);
  expect(sentences[0].logicalId).toBe(original.logicalId);
  expect(sentences[0].content[0].marks.map((mark: { type: string }) => mark.type).sort()).toEqual(['bold', 'italic', 'strikethrough', 'underline']);
  expect(await json(await request.get(`/api/content/versions/${version.id}/content`))).toEqual(source);
});

test('authored Enter breaks survive save and preview outside clean sentence text', async ({ page, request }) => {
  const { version, headers, source } = await fixture(request);
  const original = source.roots[0].content[1].node;
  await signIn(page, 'editor'); await startFromViewer(page, 'XA', version.id, 'editorial_correction');
  const workspace = page.locator('[data-editor-workspace]'), sentence = unitCanvas(workspace, original.logicalId);
  await sentence.fill('First. Second!');
  await sentence.locator('span.ce-sentence').nth(1).evaluate(element => {
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode();
    if (!text) throw new Error('Second sentence is missing');
    const range = document.createRange(); range.setStart(text, 0); range.collapse(true);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  });
  await sentence.press('Enter'); await sentence.press('Enter');
  await workspace.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
  await page.reload();
  const sessionId = new URL(page.url()).searchParams.get('sessionId');
  const saved = await json(await request.get(`/api/editor/edit-sessions/${sessionId}/structured-draft`, { headers }));
  const sentences = saved.roots[0].content.filter((entry: { node?: { kind: string } }) => entry.node?.kind === 'sentence').map((entry: { node: { content: { text: string; lineBreaksBefore?: number }[] } }) => entry.node);
  expect(sentences.slice(0, 2).map((node: { content: { text: string }[] }) => node.content[0].text)).toEqual(['First.', 'Second!']);
  expect(sentences[1].content[0].lineBreaksBefore).toBe(2);
  await workspace.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(workspace.locator('[data-authored-break]')).toHaveCount(2);
  expect(await json(await request.get(`/api/content/versions/${version.id}/content`))).toEqual(source);
});

test('marker context actions retain notes, move atomically and require a marker while allowing shared footnotes', async ({ page, request }) => {
  const { version, headers, source } = await fixture(request);
  const original = source.roots[0].content[1].node;
  await signIn(page, 'editor'); await startFromViewer(page, 'XA', version.id, 'editorial_correction');
  const workspace = page.locator('[data-editor-workspace]'), sentence = unitCanvas(workspace, original.logicalId);
  await selectBodyText(sentence, 'Original wording.'.length);
  await workspace.getByRole('button', { name: 'Footnotes', exact: true }).click();
  await workspace.getByRole('button', { name: 'New footnote…', exact: true }).click();
  await workspace.getByRole('textbox', { name: 'Footnote text', exact: true }).fill('A note retained while its marker moves.');
  await workspace.getByRole('button', { name: 'Insert marker and note', exact: true }).click();
  const marker = sentence.getByRole('button', { name: 'Show footnote 1', exact: true });
  await marker.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Remove marker', exact: true }).click();
  await expect(marker).toHaveCount(0);
  const unsavedUrl = page.url(), sessionIdBeforeSave = new URL(unsavedUrl).searchParams.get('sessionId');
  await workspace.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(workspace.getByRole('alert')).toContainText('Footnote 1 needs a marker before you can save.');
  expect(page.url()).toBe(unsavedUrl);
  const beforeSave = await json(await request.get(`/api/editor/edit-sessions/${sessionIdBeforeSave}/structured-draft`, { headers }));
  expect(beforeSave.operations).toHaveLength(0);
  await expect(workspace.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  await selectBodyText(sentence, 0);
  await workspace.getByRole('button', { name: 'Footnotes', exact: true }).click();
  await workspace.getByRole('button', { name: 'Add marker for footnote 1', exact: true }).click();
  await expect(marker).toHaveCount(1);
  await marker.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move marker…', exact: true }).click();
  await expect(marker).toHaveCount(1);
  await selectBodyText(sentence, 'Original'.length);
  await workspace.getByRole('button', { name: 'Place marker', exact: true }).click();
  await expect(marker).toHaveCount(1);
  await workspace.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible(); await page.reload();
  const sessionId = new URL(page.url()).searchParams.get('sessionId');
  const saved = await json(await request.get(`/api/editor/edit-sessions/${sessionId}/structured-draft`, { headers }));
  const entries = saved.roots[0].content.flatMap((entry: { node?: { content: unknown[] } }) => entry.node ? entry.node.content : [entry]);
  const notes = entries.filter((entry: { format?: string }) => entry.format === 'footnote');
  const references = entries.flatMap((entry: { references?: { start: number; target: { type: string; footnoteId: string } }[] }) => entry.references ?? []).filter((reference: { target: { type: string } }) => reference.target.type === 'footnote');
  expect(notes).toHaveLength(1); expect(references).toHaveLength(1);
  expect(references[0].start).toBe('Original'.length);
  expect(await json(await request.get(`/api/content/versions/${version.id}/content`))).toEqual(source);
});

test('one endnote can be reused across articles while moving and removing only a selected marker', async ({ page, request }) => {
  const { version, headers, source } = await fixture(request, false, ['.', '!', '?'], true);
  await signIn(page, 'editor'); await startFromViewer(page, 'XA', version.id, 'editorial_correction');
  const workspace = page.locator('[data-editor-workspace]'), firstId = source.roots[0].content[0].logicalId, secondId = source.roots[1].content[0].logicalId;
  const noteId = source.roots[1].content[1].logicalId, first = textCanvas(workspace, firstId);
  await expect(workspace.locator('#editor-fn-' + noteId)).toContainText('Shared source note.');
  await selectBodyText(first, 0);
  await workspace.getByRole('button', { name: 'Footnotes', exact: true }).click();
  await workspace.getByRole('button', { name: 'Add marker for footnote a', exact: true }).click();
  await expect(first.getByRole('button', { name: 'Show footnote a', exact: true })).toHaveCount(2);
  await workspace.getByRole('button', { name: 'Editor view', exact: true }).click();
  await workspace.getByRole('button', { name: 'Article 47 Shared footnotes', exact: true }).click();
  const second = textCanvas(workspace, secondId);
  await selectBodyText(second, 6);
  await workspace.getByRole('button', { name: 'Footnotes', exact: true }).click();
  await workspace.getByRole('button', { name: 'Add marker for footnote a', exact: true }).click();
  await expect(workspace.locator('#editor-fn-' + noteId)).toContainText('Shared source note.');
  const marker = second.getByRole('button', { name: 'Show footnote a', exact: true });
  await marker.focus(); await marker.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Move marker…', exact: true }).click();
  await selectBodyText(second, 3);
  await workspace.getByRole('button', { name: 'Place marker', exact: true }).click();
  await workspace.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible(); await page.reload();
  const sessionId = new URL(page.url()).searchParams.get('sessionId');
  const saved = await json(await request.get(`/api/editor/edit-sessions/${sessionId}/structured-draft`, { headers }));
  const firstEntry = saved.roots[0].content.find((entry: { logicalId: string }) => entry.logicalId === firstId);
  const secondEntry = saved.roots[1].content.find((entry: { logicalId: string }) => entry.logicalId === secondId);
  expect(firstEntry.references.map((reference: { start: number }) => reference.start)).toEqual([0, 7]);
  expect(secondEntry.references).toEqual([expect.objectContaining({ start: 3, end: 3, target: expect.objectContaining({ type: 'footnote', footnoteId: noteId }) })]);
  expect(saved.roots.flatMap((root: { content: { format?: string }[] }) => root.content).filter((entry: { format?: string }) => entry.format === 'footnote')).toHaveLength(1);
  await marker.focus(); await marker.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Remove marker', exact: true }).click();
  await expect(marker).toHaveCount(0);
  await expect(workspace.locator('#editor-fn-' + noteId), 'article scope hides a note after its local marker is removed').toHaveCount(0);
  await workspace.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
  const after = await json(await request.get(`/api/editor/edit-sessions/${sessionId}/structured-draft`, { headers }));
  expect(after.roots[0].content.find((entry: { logicalId: string }) => entry.logicalId === firstId).references).toEqual(firstEntry.references);
  expect(after.roots[1].content.find((entry: { logicalId: string }) => entry.logicalId === secondId).references ?? []).toEqual([]);
  expect(await json(await request.get(`/api/content/versions/${version.id}/content`))).toEqual(source);
});
