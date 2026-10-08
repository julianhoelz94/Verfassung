import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as axeCore from 'axe-core';
import type { ContentOutline } from '../../lib/api';
import type { DraftNode, DraftOperation, StructuredPreview } from '../../lib/structured-editor';
import { StructuredEditor } from './StructuredEditor';
import { EditorDraftState, SubmitReviewButton } from './EditorDraftState';

const axeRun = typeof axeCore.run === 'function' ? axeCore.run.bind(axeCore) : (axeCore as unknown as { default: { run: typeof axeCore.run } }).default.run;
type Level = ContentOutline['kinds'][number];
function level(kind: string, depth: number, child?: string, overrides: Partial<Level> = {}): Level {
  return { kindCode: kind.toLowerCase(), displayLabel: kind, sortOrder: depth, mayHoldText: !child, mayHoldChildren: Boolean(child), allowedChildKinds: child ? [child.toLowerCase()] : [], presentation: 'section', showLabel: true, showTitle: true, showKind: true, titlePolicy: 'optional', labelPolicy: 'optional', segmentation: 'plain', ...overrides };
}
function node(kind: string, id: string, text = 'One. Two!'): DraftNode {
  return { logicalId: id, revisionId: `revision-${id}`, kind: kind.toLowerCase(), label: null, title: null, content: [{ type: 'text', logicalId: `text-${id}`, revisionId: `revision-text-${id}`, text }] };
}
function mixed() {
  const outline = { kinds: [level('Article', 0, 'Sentence', { mayHoldText: true, titlePolicy: 'required', labelPolicy: 'required' }), level('Sentence', 1, undefined, { segmentation: 'sentence', presentation: 'concatenated' })] };
  const sentence = node('Sentence', 'sentence');
  const article: DraftNode = { ...node('Article', 'article'), label: '46a', title: 'Rights', content: [
    { type: 'text', logicalId: 'before', revisionId: 'revision-before', text: 'Before.' },
    { type: 'child', node: sentence },
    { type: 'text', logicalId: 'after', revisionId: 'revision-after', text: 'After.' },
  ] };
  return { outline, roots: [article] };
}

describe('structured editor acceptance', () => {
  let host: HTMLElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.documentElement.lang = 'en'; document.title = 'Constitution editor';
    window.history.replaceState(null, '', '/editor');
    host = document.createElement('main'); document.body.appendChild(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
  async function mount(outline: ContentOutline, roots: DraftNode[], scope?: string, extras: Partial<ComponentProps<typeof StructuredEditor>> = {}) {
    const preview: StructuredPreview = { sessionId: 'session', sourceVersionId: 'source', sourceGeneration: 1, settingsRevisionId: 'settings', generation: 0, sourceRoots: roots, roots, operations: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => preview }));
    await act(async () => root.render(<EditorDraftState><StructuredEditor preview={preview} outline={outline} rootId={roots[0].logicalId} versionId="source" articleId="unit" constitutionId="constitution" editable scope={scope} {...extras} /><SubmitReviewButton disabled={false} /></EditorDraftState>));
    return preview;
  }
  function button(name: string, index = 0): HTMLButtonElement {
    const found = [...host.querySelectorAll('button')].filter(item => item.textContent === name)[index];
    expect(found, `button ${name}`).toBeDefined(); return found;
  }
  async function click(name: string, index = 0) { await act(async () => button(name, index).click()); }
  async function change(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
    await act(async () => { field.value = value; Simulate.change(field); });
  }
  function field(label: string): HTMLInputElement { return host.querySelector(`[aria-label="${label}"]`)!; }
  function payload(): { expectedGeneration: number; operations: DraftOperation[] } { return JSON.parse((host.querySelector('[name="structuredDraft"]') as HTMLInputElement).value); }
  function texts() { return [...host.querySelectorAll('textarea')]; }

  it.each(['none', 'optional', 'required'])('honors %s title and literal-label policies for a one-level custom plain root', async policy => {
    const outline = { kinds: [level('Clause', 0, undefined, { titlePolicy: policy, labelPolicy: policy })] };
    const clause = { ...node('Clause', 'clause', 'Plain custom text.'), label: policy === 'none' ? null : 'bis', title: policy === 'none' ? null : 'Custom title' };
    await mount(outline, [clause]);
    expect(texts()[0].value).toBe('Plain custom text.');
    expect(host.querySelector('[aria-label="Clause title"]') !== null).toBe(policy !== 'none');
    expect(host.querySelector('[aria-label="Clause literal label"]') !== null).toBe(policy !== 'none');
    expect([...host.querySelectorAll('button')].some(item => item.textContent === 'Suggest sentence boundaries')).toBe(false);
    if (policy !== 'none') {
      expect(field('Clause title').required).toBe(policy === 'required');
      await change(field('Clause title'), ''); await change(field('Clause literal label'), '');
      expect(button('Save draft').disabled).toBe(policy === 'required');
      if (policy === 'required') { await change(field('Clause literal label'), '(2a)'); await change(field('Clause title'), 'Restored'); expect(button('Save draft').disabled).toBe(false); }
    }
  });

  it('derives five-depth scope stops, hides parent text in narrower views and retains keyboard focus/selection', async () => {
    const kinds = ['Part', 'Chapter', 'Article', 'Paragraph', 'Sentence'];
    const outline = { kinds: kinds.map((kind, depth) => level(kind, depth, kinds[depth + 1], { titlePolicy: depth === 0 ? 'none' : 'optional', labelPolicy: depth === 0 ? 'none' : 'optional' })) };
    let nested = node('Sentence', 'sentence');
    for (let depth = kinds.length - 2; depth >= 0; depth--) nested = { ...node(kinds[depth], kinds[depth].toLowerCase()), content: [{ type: 'child', node: nested }] };
    await mount(outline, [nested]);
    const scope = host.querySelector('select')!;
    expect([...scope.options].map(item => item.textContent)).toEqual(['Constitution', ...kinds]);
    expect(scope.value).toBe('article'); expect(texts()).toHaveLength(1);
    await act(async () => texts()[0].focus());
    expect(document.activeElement).toBe(texts()[0]);
    expect(new URL(window.location.href).searchParams.get('selectedNode')).toBe('text-sentence');
    await change(scope, 'constitution'); expect(texts()).toHaveLength(0);
    await change(scope, 'paragraph'); expect(texts()[0].value).toBe('One. Two!');
    expect(new URL(window.location.href).searchParams.get('selectedNode')).toBe('text-sentence');
    expect(field('Paragraph title')).not.toBeNull();
  });

  it('labels interactive fields for assistive technology and permits optional sentence title editing', async () => {
    const fixture = mixed(); await mount(fixture.outline, fixture.roots);
    await change(field('Sentence title'), 'Optional sentence title');
    expect(payload().operations).toContainEqual(expect.objectContaining({ type: 'set_metadata', targetId: 'sentence', title: 'Optional sentence title' }));
    expect(host.querySelector('[aria-label="Selection inspector"]')).not.toBeNull();
    const results = await axeRun(host, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map(item => `${item.id}: ${item.description}`)).toEqual([]);
  });

  it('segments pasted sentence wording into explicit children without changing parent runs, and undoes the complete action', async () => {
    const fixture = mixed(); await mount(fixture.outline, fixture.roots);
    const pasted = 'Art.12 applies. Next!\nLast?';
    await change(texts()[1], pasted);
    await click('Suggest sentence boundaries');
    expect(texts().map(item => item.value)).toEqual(['Before.', 'Art.12 applies. ', 'Next!\n', 'Last?', 'After.']);
    const saved = payload();
    const split = saved.operations.find(item => item.type === 'split_text')!;
    expect(split.targetId).toBe('text-sentence'); expect(split.parts!.map(part => part.text).join('')).toBe(pasted);
    const inserts = saved.operations.filter(item => item.type === 'insert_child');
    expect(inserts).toHaveLength(2); expect(inserts.every(item => item.node?.kind === 'sentence')).toBe(true);
    expect(saved.operations.filter(item => item.type === 'move').map(item => item.targetId)).toEqual(split.parts!.slice(1).map(part => part.logicalId));
    expect(saved.operations.every(item => !['before', 'after'].includes(item.targetId))).toBe(true);
    expect(button('Submit for review').disabled).toBe(true);
    await click('Undo'); expect(texts().map(item => item.value)).toEqual(['Before.', pasted, 'After.']);
    expect(payload().operations.map(item => item.type)).toEqual(['replace_text']);
    await click('Undo'); expect(texts()[1].value).toBe('One. Two!'); expect(button('Submit for review').disabled).toBe(false);
  });

  it('splits at the selected cursor and merges adjacent untitled sentence children with explicit lineage', async () => {
    const fixture = mixed(); await mount(fixture.outline, fixture.roots);
    await act(async () => { texts()[1].focus(); texts()[1].setSelectionRange(5, 5); Simulate.select(texts()[1]); });
    await click('Split at cursor', 1);
    expect(texts().map(item => item.value)).toEqual(['Before.', 'One. ', 'Two!', 'After.']);
    const split = payload().operations.find(item => item.type === 'split_text')!;
    expect(split.expectedRevisionId).toBe('revision-text-sentence');
    expect(split.parts!.map(part => part.text)).toEqual(['One. ', 'Two!']);
    await click('Merge with next sentence');
    expect(texts().map(item => item.value)).toEqual(['Before.', 'One. Two!', 'After.']);
    const merge = payload().operations.find(item => item.type === 'merge_text')!;
    expect(merge.mergeIds).toEqual(split.parts!.map(part => part.logicalId));
    expect(merge.parts![0].text).toBe('One. Two!');
    expect(payload().operations.at(-1)?.type).toBe('remove');
  });

  it('does not merge parent text across a child, or erase a titled following sentence', async () => {
    const fixture = mixed();
    const second = { ...node('Sentence', 'second', 'Titled successor.'), title: 'Keep this title' };
    fixture.roots[0].content.splice(2, 0, { type: 'child', node: second });
    await mount(fixture.outline, fixture.roots);
    expect(button('Merge with next', 0).disabled).toBe(true);
    expect([...host.querySelectorAll('button')].some(item => item.textContent === 'Merge with next sentence')).toBe(false);
    expect(payload().operations).toEqual([]); expect(field('Sentence title').value).toBe('');
    expect(host.querySelectorAll('[aria-label="Sentence title"]')[1].getAttribute('value')).toBe('Keep this title');
  });

  it('retains saved review differences and historical links for an unloaded root', async () => {
    const outline = { kinds: [level('Clause', 0)] };
    const first = node('Clause', 'first', 'Selected source.'), second = { ...node('Clause', 'second'), content: [] };
    await mount(outline, [first, second], undefined, { review: [{ logicalId: 'text-second', field: 'text', before: 'Historical wording.', after: 'Saved correction.', sourceRevisionId: 'old-text', targetRevisionId: 'saved-op', sourceLink: '/versions/historical/units/second', targetLink: '/versions/successor/units/second' }] });
    expect(texts()).toHaveLength(1);
    expect(host.querySelector('del')?.textContent).toBe('Historical wording.');
    expect(host.querySelector('ins')?.textContent).toBe('Saved correction.');
    expect(host.querySelector('a[href="/versions/historical/units/second"]')).not.toBeNull();
    await change(texts()[0], 'Unsaved first correction.');
    expect([...host.querySelectorAll('ins')].map(item => item.textContent)).toEqual(['Saved correction.', 'Unsaved first correction.']);
  });

  it('locks scope, navigation and saving while an overview request is pending', async () => {
    const fixture = mixed(); const preview = await mount(fixture.outline, fixture.roots, 'constitution');
    let release!: (response: { ok: boolean; json: () => Promise<StructuredPreview> }) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(resolve => { release = resolve; })));
    const scope = host.querySelector('select')!;
    await change(scope, 'constitution');
    expect(scope.disabled).toBe(true); expect(button('Save draft').disabled).toBe(true);
    expect(button('Article 46a Rights').disabled).toBe(true);
    expect(host.textContent).toContain('Loading editor view');
    await act(async () => release({ ok: true, json: async () => preview }));
    expect(scope.disabled).toBe(false); expect(button('Article 46a Rights').disabled).toBe(false);
  });

  it('loads another root without overwriting unsaved text, and preserves the loaded root through undo', async () => {
    const outline = { kinds: [level('Article', 0)] };
    const first = { ...node('Article', 'first', 'First source.'), label: '1' };
    const second = { ...node('Article', 'second', 'Second saved wording.'), label: '2' };
    const preview = await mount(outline, [first, { ...second, content: [] }]);
    await change(texts()[0], 'Unsaved first wording.');
    const fetchView = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('rootId=second') ? { ...preview, roots: [{ ...first, content: [] }, second], sourceRoots: [{ ...first, content: [] }, second] } : { ...preview, roots: [{ ...first, content: [] }, { ...second, content: [] }] } }));
    vi.stubGlobal('fetch', fetchView);
    const scope = host.querySelector('select')!;
    await change(scope, 'constitution'); await click('Article 2 ');
    expect(fetchView.mock.calls[1][0]).toContain('rootId=second');
    expect(texts()[0].value).toBe('Second saved wording.');
    expect(payload().operations).toEqual([expect.objectContaining({ targetId: 'text-first', text: 'Unsaved first wording.' })]);
    await change(scope, 'constitution'); await click('Article 1 ');
    expect(texts()[0].value).toBe('Unsaved first wording.');
    await click('Undo'); expect(texts()[0].value).toBe('First source.');
    await change(scope, 'constitution'); await click('Article 2 ');
    expect(texts()[0].value).toBe('Second saved wording.');
    expect(fetchView.mock.calls.filter(([url]) => url.includes('rootId=second'))).toHaveLength(1);
  });

  it.each(['generation', 'settingsRevisionId'] as const)('rejects a mismatched %s without losing unsaved work or changing scope', async pin => {
    const fixture = mixed(); const preview = await mount(fixture.outline, fixture.roots);
    await change(texts()[1], 'Keep unsaved wording.');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...preview, [pin]: pin === 'generation' ? 2 : 'different-settings' }) }));
    const scope = host.querySelector('select')!; await change(scope, 'constitution');
    expect(scope.value).toBe('article'); expect(scope.disabled).toBe(false);
    expect(texts()[1].value).toBe('Keep unsaved wording.');
    expect(payload().operations[0].text).toBe('Keep unsaved wording.');
    expect(host.textContent).toContain('This session changed. Save or reload before navigating.');
  });
});
