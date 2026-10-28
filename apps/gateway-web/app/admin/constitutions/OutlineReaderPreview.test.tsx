import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as axeCore from 'axe-core';
import type { ContentOutline, OrderedNode } from '../../../lib/api';
import { DEFAULT_NEW_OUTLINE } from '../../../lib/outline';
import { outlineExample } from '../../../lib/outline-preview';
import { OrderedContentTree } from '../../components/ConstitutionText';
import { OutlineReaderPreview } from './OutlineReaderPreview';
import { TranslationProvider } from '../../components/TranslationProvider';
import { message } from '../../../lib/messages';

vi.mock('../../components/NodeTitleForm', () => ({ NodeTitleForm: () => null }));
const axeRun = typeof axeCore.run === 'function' ? axeCore.run.bind(axeCore) : (axeCore as unknown as { default: { run: typeof axeCore.run } }).default.run;

function outline(mixed = false): ContentOutline {
  return { kinds: DEFAULT_NEW_OUTLINE.map((kind, index) => ({
    ...kind, sortOrder: index + 1, root: index === 0,
    allowedChildKinds: DEFAULT_NEW_OUTLINE[index + 1] ? [DEFAULT_NEW_OUTLINE[index + 1]!.kindCode] : [],
    mayHoldChildren: index < 2, mayHoldText: mixed || index === 2,
    allowTextAlongsideChildren: mixed && index < 2,
  })) };
}

describe('annotated reader preview', () => {
  let host: HTMLElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('main'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
  async function mount(settings = outline(), roots = outlineExample(settings)) {
    await act(async () => root.render(<OutlineReaderPreview roots={roots} outline={settings} />));
  }
  function sentence(): HTMLElement { return host.querySelector<HTMLElement>('[data-preview-kind="sentence"]')!; }

  it('preserves the public reader layout and keeps sibling sentences in one paragraph', async () => {
    const settings = outline();
    const roots = outlineExample(settings);
    await act(async () => root.render(<OrderedContentTree entries={roots.map(node => ({ type: 'child', node }))} outline={settings} />));
    const readerText = host.textContent;
    const blocks = host.querySelectorAll('section').length;
    await mount(settings, roots);
    expect(host.textContent).toBe(readerText);
    expect(host.querySelectorAll('section')).toHaveLength(blocks);
    expect(host.querySelectorAll('[role="tooltip"]')).toHaveLength(0);
    const run = host.querySelector('.constitution-concat')!;
    expect(run.textContent).toBe('Everyone has the right to equal protection. The law shall protect these rights.');
    expect(run.querySelectorAll('[data-preview-kind="sentence"]')).toHaveLength(2);
  });

  it('shows only the hovered leaf configuration, using effective display settings', async () => {
    const settings = outline();
    settings.kinds[2] = { ...settings.kinds[2]!, displayLabel: 'Sentence leaf', showKind: true, showTitle: true };
    await mount(settings);
    await act(async () => fireEvent.pointerOver(sentence()));
    const tooltip = host.querySelector('[role="tooltip"]')!;
    expect(host.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
    expect(tooltip.textContent).toContain('Sentence leaf');
    expect(tooltip.textContent).toContain('Text leaf · No child units');
    expect(tooltip.textContent).toContain('running text, joined with adjacent sibling units');
    expect(tooltip.textContent).toContain('Kind name: hidden · Title: hidden');
    expect(tooltip.textContent).toContain('sentence boundary assistance');
    expect(sentence().getAttribute('aria-describedby')).toBe(tooltip.id);
    await act(async () => fireEvent.keyDown(sentence(), { key: 'Escape' }));
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('distinguishes unnumbered units and old versus current samples for assistive technology', async () => {
    const settings = outline();
    const roots = outlineExample(settings, value => message('en', value));
    function unnumber(node: OrderedNode) {
      node.label = null;
      node.content.forEach(entry => { if (entry.node) unnumber(entry.node); });
    }
    roots.forEach(unnumber);
    await act(async () => root.render(<TranslationProvider locale="en">
      <OutlineReaderPreview roots={roots} outline={settings} label="Previous proposal" />
      <OutlineReaderPreview roots={roots} outline={settings} label="Current proposal" />
    </TranslationProvider>));
    const labels = [...host.querySelectorAll('[data-preview-kind]')].map(unit => unit.getAttribute('aria-label'));
    expect(new Set(labels).size).toBe(labels.length);
    const result = await axeRun(host, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map(item => item.id)).toEqual([]);
  });

  it('supports keyboard focus and tapping, and keeps nested annotations separate', async () => {
    await mount();
    const article = host.querySelector<HTMLElement>('[data-preview-kind="article"]')!;
    await act(async () => article.focus());
    expect(host.querySelector('[role="tooltip"]')?.textContent).toContain('Structural unit · Children: Paragraph');
    await act(async () => sentence().focus());
    expect(host.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
    expect(host.querySelector('[role="tooltip"]')?.textContent).toContain('Text leaf');
    await act(async () => sentence().blur());
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    await act(async () => sentence().click());
    expect(document.activeElement).toBe(sentence());
    expect(host.querySelector('[role="tooltip"]')?.textContent).toContain('Text leaf');
    const result = await axeRun(host, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map(item => item.id)).toEqual([]);
  });

  it('demonstrates running text even when parent text is allowed between units', async () => {
    await mount(outline(true));
    const runs = [...host.querySelectorAll('.constitution-concat')];
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every(run => run.querySelectorAll('[data-preview-kind="sentence"]').length === 2)).toBe(true);
    expect(runs[0]!.textContent).toBe('Everyone has the right to equal protection. The law shall protect these rights.');
    expect(host.textContent).toContain('These rights apply to everyone.');
  });

  it('localizes annotations and generated samples without translating supplied source text', async () => {
    const settings = outline();
    const roots = outlineExample(settings, value => message('de', value));
    await act(async () => root.render(<TranslationProvider locale="de"><OutlineReaderPreview roots={roots} outline={settings} /></TranslationProvider>));
    expect(host.textContent).toContain('Alle Menschen haben das Recht auf gleichen Schutz.');
    await act(async () => sentence().focus());
    expect(host.querySelector('[role="tooltip"]')?.textContent).toContain('Textebene · Keine untergeordneten Einheiten');
    expect(sentence().getAttribute('aria-label')).toBe('Einstellungen für Sentence (1)');
    await act(async () => root.render(<TranslationProvider locale="de"><OutlineReaderPreview roots={outlineExample(settings)} outline={settings} /></TranslationProvider>));
    expect(host.textContent).toContain('Everyone has the right to equal protection.');
  });

  it('keeps containers distinct when their display is configured as running text', async () => {
    const settings = outline(true);
    settings.kinds[1] = { ...settings.kinds[1]!, presentation: 'concatenated' };
    await mount(settings);
    expect(host.querySelectorAll('[data-preview-kind="paragraph"]')).toHaveLength(2);
    expect([...host.querySelectorAll('.constitution-concat')].every(run => run.querySelectorAll('[data-preview-kind="sentence"]').length === 2)).toBe(true);
  });

  it('shows consecutive running sentences after a different allowed child kind', async () => {
    const settings = outline(true);
    settings.kinds[0] = { ...settings.kinds[0]!, allowedChildKinds: ['paragraph', 'sentence'] };
    await mount(settings);
    const run = host.querySelector('[data-preview-kind="article"] > .node-tree > .constitution-concat')!;
    expect(run.querySelectorAll('[data-preview-kind="sentence"]')).toHaveLength(2);
    expect(run.textContent).toBe('The law shall protect these rights. Human dignity shall be respected.');
  });

  it('retains supplied sample order, labels, anchors, and deliberate mixed-content breaks', async () => {
    const settings = outline(true);
    const sample: OrderedNode = {
      logicalId: 'root', revisionId: 'revision', occurrenceId: 'root-occurrence', kind: 'article', label: '7bis', title: 'Source heading',
      content: [
        { type: 'child', node: { logicalId: 'first', revisionId: 'first', occurrenceId: 'first-occurrence', kind: 'sentence', label: null, title: null, content: [{ type: 'text', text: 'First source sentence.' }] } },
        { type: 'text', logicalId: 'parent-text', occurrenceId: 'parent-text', text: 'Parent text between sentences.' },
        { type: 'child', node: { logicalId: 'second', revisionId: 'second', occurrenceId: 'second-occurrence', kind: 'sentence', label: null, title: null, content: [{ type: 'text', text: 'Second source sentence.' }] } },
      ],
    };
    const original = JSON.stringify(sample);
    await mount(settings, [sample]);
    expect(JSON.stringify(sample)).toBe(original);
    expect(host.textContent).toBe('Article 7bis — Source headingFirst source sentence.Parent text between sentences.Second source sentence.');
    expect(host.querySelectorAll('.constitution-concat')).toHaveLength(2);
    expect(host.querySelector('[id$="first-occurrence"]')).not.toBeNull();
    expect(host.querySelector('[id$="second-occurrence"]')).not.toBeNull();
  });
});
