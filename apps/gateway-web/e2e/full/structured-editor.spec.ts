import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { adminHeaders } from './api-fixtures';
import { signIn, signOut } from './auth';

async function json(response: Awaited<ReturnType<APIRequestContext['post']>>) {
  const result = await response.json();
  expect(response.ok(), JSON.stringify(result)).toBeTruthy(); return result;
}
async function fixture(request: APIRequestContext, single = false) {
  const headers = await adminHeaders(request);
  const outline = single ? [{ kindCode: 'clause', displayLabel: 'Clause', titlePolicy: 'none', labelPolicy: 'required', segmentation: 'plain' }] : [
    { kindCode: 'article', displayLabel: 'Article', allowTextAlongsideChildren: true, titlePolicy: 'required', labelPolicy: 'required' },
    { kindCode: 'sentence', displayLabel: 'Sentence', segmentation: 'sentence', presentation: 'concatenated', labelPolicy: 'optional', titlePolicy: 'optional' },
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
  const source = await json(await request.put(`/api/content/versions/${version.id}/content`, { headers, data: { expectedGeneration: 0, roots } }));
  await json(await request.post(`/api/catalog/versions/${version.id}/publish`, { headers }));
  return { headers, constitution, version, source };
}
for (const hop of ['editorial_correction', 'legal'] as const) {
  test(`ordered ${hop} preserves historical units and shares unchanged branches`, async ({ page, request }) => {
    test.setTimeout(180_000);
    const { version, source, headers, constitution } = await fixture(request);
    const sourceRoot = source.roots[0], sourceSentence = sourceRoot.content[1].node;
    await signIn(page, 'editor');
    const control = hop === 'legal' ? 'Current law' : 'Correct this text';
    const action = hop === 'legal' ? 'Record the next legal change' : 'Correct this text';
    await page.getByLabel(control).selectOption(version.id);
    await page.getByRole('button', { name: action, exact: true }).click();
    await expect(page.getByLabel('Editor view')).toHaveValue('article');
    const canvas = page.locator('#draft-form');
    await expect(canvas.getByLabel('Unnumbered parent text').first()).toHaveValue('Before.');
    await page.getByLabel('Editor view').selectOption('sentence');
    await expect(canvas.getByLabel('Unnumbered parent text')).toHaveCount(0);
    await expect(canvas.getByLabel('Sentence text').first()).toHaveValue('Original wording.');
    await canvas.getByLabel('Sentence text').first().fill('Changed wording.');
    await expect(page.getByRole('button', { name: 'Submit for review' })).toBeDisabled();
    await page.getByLabel('Editor view').selectOption('constitution');
    await expect(canvas.locator('textarea')).toHaveCount(0);
    await page.getByLabel('Editor view').selectOption('article');
    await expect(canvas.getByLabel('Sentence text').first()).toHaveValue('Changed wording.');
    await canvas.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Session').getByText('Changed wording.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(canvas.getByLabel('Sentence text').first()).toHaveValue('Changed wording.');
    await canvas.getByText(/Entry-level review/).click();
    await expect(canvas.locator('del')).toContainText(['Original wording.']);
    await expect(canvas.locator('ins')).toContainText(['Changed wording.']);
    const sessionId = new URL(page.url()).searchParams.get('sessionId');
    const draft = await json(await request.get(`/api/editor/edit-sessions/${sessionId}/structured-draft`, { headers }));
    expect(draft.operations).toHaveLength(1);
    expect(draft.operations[0].type).toBe('replace_text');
    expect(draft.roots[0].content[3].node.revisionId).toBe(sourceRoot.content[3].node.revisionId);
    if (hop === 'legal') {
      await page.getByLabel('Title', { exact: true }).last().fill('Structured law');
      await page.getByLabel('Comment', { exact: true }).fill('Changed one sentence.');
      await page.getByLabel('Document URL').fill('https://example.org/structured-law.pdf');
      await page.getByRole('button', { name: 'Save change record' }).click();
    } else {
      await page.getByLabel('What was corrected in this transcription?').fill('Corrected one sentence.');
      await page.getByRole('button', { name: 'Save comment' }).click();
    }
    await page.getByRole('button', { name: 'Submit for review' }).click();
    const sessionUrl = page.url();
    await signOut(page); await signIn(page, 'reviewer'); await page.goto(sessionUrl);
    await expect(canvas.getByLabel('Sentence text').first()).toBeDisabled();
    await expect(canvas.locator('del')).toContainText(['Original wording.']);
    await page.getByRole('button', { name: 'Approve review' }).click();
    await signOut(page); await signIn(page, 'publisher'); await page.goto(sessionUrl);
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
    await expect(page.getByText('Original wording.', { exact: true })).toBeVisible();
    await page.goto(`/countries/XA/versions/${targetId}/units/${targetRoot.occurrenceId}`);
    await expect(page.getByText('Changed wording.', { exact: true })).toBeVisible();
    await expect(page.getByText('Before.', { exact: true })).toBeVisible();
    await expect(page.getByText('Between.', { exact: true })).toBeVisible();
    await expect(page.getByText('After.', { exact: true })).toBeVisible();
    const rendered = await page.locator('main').innerText();
    const positions = ['Before.', 'Changed wording.', 'Between.', 'Untouched branch.', 'After.'].map(text => rendered.indexOf(text));
    expect(positions.every(position => position >= 0)).toBeTruthy();
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    await expect.poll(async () => {
      const found = await json(await request.get(`/api/search?q=Changed%20wording&versionId=${targetId}`));
      return found.total;
    }, { timeout: 30_000 }).toBeGreaterThan(0);
    const originalSearch = await json(await request.get(`/api/search?q=Changed%20wording&versionId=${version.id}`));
    expect(originalSearch.total).toBe(0);
    if (hop === 'legal') {
      const laws = await json(await request.get(`/api/amendment/constitutions/${constitution.id}/amendments`));
      expect(laws).toHaveLength(1);
      expect(laws[0].sourceVersionId).toBe(version.id);
      expect(laws[0].targetVersionId).toBe(targetId);
    }
  });
}

test('custom one-level root supports literal labels, plain text and new root navigation', async ({ page, request }) => {
  const { version } = await fixture(request, true);
  await signIn(page, 'editor');
  await page.getByLabel('Correct this text').selectOption(version.id);
  await page.getByRole('button', { name: 'Correct this text', exact: true }).click();
  const canvas = page.locator('#draft-form');
  await expect(page.getByLabel('Editor view')).toHaveValue('clause');
  await expect(canvas.getByLabel('Clause title')).toHaveCount(0);
  await canvas.getByLabel('Clause literal label').fill('');
  await canvas.getByLabel('Clause text').fill('Custom root changed.');
  await expect(canvas.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  await canvas.getByLabel('Clause literal label').fill('(2a)');
  await canvas.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
  await canvas.getByRole('button', { name: 'Add top-level unit' }).click();
  await canvas.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByRole('link', { name: 'Clause New label' }).click();
  await expect(canvas.getByLabel('Clause literal label')).toHaveValue('New label');
  await canvas.getByLabel('Clause literal label').fill('bis');
  await canvas.getByLabel('Clause text').fill('New root text.');
  await canvas.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.reload();
  await expect(canvas.getByLabel('Clause text')).toHaveValue('New root text.');
});


test('pasted boundaries, inline titles and keyboard edits persist with explicit lineage', async ({ page, request }) => {
  const { version, headers } = await fixture(request);
  await signIn(page, 'editor');
  await page.getByLabel('Correct this text').selectOption(version.id);
  await page.getByRole('button', { name: 'Correct this text', exact: true }).click();
  const canvas = page.locator('#draft-form');
  const pasted = 'Art.12 applies. Next! ';
  const sentence = canvas.getByLabel('Sentence text').first();
  await sentence.fill(pasted);
  await sentence.press('Tab');
  await expect(canvas.getByRole('button', { name: 'Split at cursor', exact: true }).nth(1)).toBeFocused();
  await canvas.getByRole('button', { name: 'Suggest sentence boundaries' }).first().click();
  await expect(canvas.getByLabel('Sentence text')).toHaveCount(3);
  await expect(canvas.getByLabel('Sentence text').nth(0)).toHaveValue('Art.12 applies. ');
  await expect(canvas.getByLabel('Sentence text').nth(1)).toHaveValue('Next! ');
  await canvas.getByLabel('Sentence title').first().fill('Inline title');
  await canvas.getByRole('button', { name: 'Merge with next sentence' }).first().click();
  await expect(canvas.getByLabel('Sentence text').first()).toHaveValue(pasted);
  await canvas.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(canvas.getByLabel('Sentence text').first()).toHaveValue(pasted);
  await expect(canvas.getByLabel('Sentence title').first()).toHaveValue('Inline title');
  const sessionId = new URL(page.url()).searchParams.get('sessionId');
  const draft = await json(await request.get(`/api/editor/edit-sessions/${sessionId}/structured-draft`, { headers }));
  expect(draft.operations.map((operation: { type: string }) => operation.type)).toEqual(expect.arrayContaining(['split_text', 'merge_text', 'insert_child', 'move']));
  expect(draft.roots[0].content.map((entry: { type: string }) => entry.type)).toEqual(['text', 'child', 'text', 'child', 'text']);
});
