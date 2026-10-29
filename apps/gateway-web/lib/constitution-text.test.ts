import { createElement } from 'react';
import { TranslationProvider } from '../app/components/TranslationProvider';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ContentNode, ContentOutline, OrderedEntry } from './api';
vi.mock('../app/components/NodeTitleForm', () => ({ NodeTitleForm: vi.fn(() => null) }));
import { NodeTitleForm } from '../app/components/NodeTitleForm';
import { DiffConstitutionText } from '../app/components/DiffConstitutionText';
import { ConstitutionFootnotes, ConstitutionText, NodeTree, OrderedContentTree } from '../app/components/ConstitutionText';
const outline: ContentOutline = { kinds: [
  { kindCode: 'article', displayLabel: 'Article', sortOrder: 1, mayHoldText: true, mayHoldChildren: true, allowedChildKinds: ['sentence'], showLabel: false, showTitle: false, showKind: false, presentation: 'section' },
  { kindCode: 'sentence', displayLabel: 'Sentence', sortOrder: 2, mayHoldText: true, mayHoldChildren: false, allowedChildKinds: [], showLabel: false, showTitle: false, showKind: false, presentation: 'concatenated' },
] };
const nodes: ContentNode[] = ['First.', 'Second.'].map((body, index) => ({ id: `${index}`, kind: 'sentence', label: `(${index})`, number: null, title: 'Hidden title', body, sortOrder: index, children: [] }));
const entries: OrderedEntry[] = nodes.map((node) => ({ type: 'child', node: { logicalId: node.id, revisionId: node.id, occurrenceId: node.id, kind: node.kind, label: node.label, title: node.title, content: [{ type: 'text', text: node.body }] } }));
describe('reader presentation', () => {
  it('renders authored breaks outside the clean sentence and its mark and reference ranges', () => {
    const text = 'Second.';
    const flowing: OrderedEntry[] = [entries[0]!, { ...entries[1]!, node: { ...entries[1]!.node!, content: [{
      type: 'text', occurrenceId: 'second-text', text, lineBreaksBefore: 2,
      marks: [{ type: 'bold', start: 0, end: 6 }],
      references: [{ logicalId: 'external', start: 0, end: 6, target: { type: 'external', url: 'https://example.org' } }],
    }] } }];
    const html = renderToStaticMarkup(createElement(ConstitutionText, { entries: flowing, outline }));
    expect(html.match(/data-authored-break="true"/g)).toHaveLength(2);
    expect(html).toContain('<a id="ref-external" class="xref" href="https://example.org"><strong>Second</strong></a>');
    expect(html).toContain('id="second-text"><a');
    expect(html).not.toContain('> Second');
  });
  it('uses the block boundary once in line-by-line mode while preserving extra authored blank lines', () => {
    const lined = { kinds: outline.kinds.map(kind => ({ ...kind, presentation: 'section' })) };
    const withBreaks = entries.map((entry, index) => ({ ...entry, node: { ...entry.node!, content: [{ ...entry.node!.content[0]!, lineBreaksBefore: index + 1 }] } }));
    const html = renderToStaticMarkup(createElement(ConstitutionText, { entries: withBreaks, outline: lined }));
    expect(html.match(/data-authored-break="true"/g)).toHaveLength(1);
    expect(html.replace(/<[^>]*>/g, '')).toBe('First.Second.');
  });
  it('makes a layout-only comparison visible while retaining unchanged wording', () => {
    const left = { articleNumber: '1', title: '', legacyIdentity: true, content: entries };
    const right = { ...left, content: [entries[0]!, { ...entries[1]!, node: { ...entries[1]!.node!, content: [{ ...entries[1]!.node!.content[0]!, logicalId: 'second-text', lineBreaksBefore: 1 }] } }] };
    left.content = [entries[0]!, { ...entries[1]!, node: { ...entries[1]!.node!, content: [{ ...entries[1]!.node!.content[0]!, logicalId: 'second-text' }] } }];
    const html = renderToStaticMarkup(createElement(DiffConstitutionText, { left, right, side: 'to', outline }));
    expect(html).toContain('title="Sentence spacing changed"');
    expect(html).toContain('data-authored-break="true"');
    expect(html).not.toContain('<ins');
    expect(html).not.toContain('<del');
    expect(html.replace(/<[^>]*>/g, '')).toBe('First.Second.');
  });
  it('shares numbered endnote rows, attribution and formatting with editable preview slots', () => {
    const note: OrderedEntry = { type: 'text', logicalId: 'note', occurrenceId: 'note-occ', format: 'footnote', footnoteLabel: '3', text: 'Exact source.', marks: [{ type: 'italic', start: 0, end: 5 }], annotation: { kind: 'source', attribution: 'Archive' } };
    const reader = renderToStaticMarkup(createElement(ConstitutionFootnotes, { entries: [note] }));
    const preview = renderToStaticMarkup(createElement(ConstitutionFootnotes, { entries: [note], footnoteActions: () => createElement('button', { type: 'button' }, 'Edit') }));
    expect(reader).toContain('<h2>Footnotes</h2>');
    expect(reader).toContain('id="fn-note-occ"');
    expect(reader).toContain('<em>Exact</em>');
    expect(reader).toContain('Archive');
    expect(reader.match(/role="note"/g)).toHaveLength(1);
    expect(preview).toContain('<button type="button">Edit</button>');
    expect(preview).toContain('class="legal-footnote');
    const inline = renderToStaticMarkup(createElement(ConstitutionFootnotes, { entries: [note], renderFootnote: () => createElement('textarea', { defaultValue: note.text! }) }));
    expect(inline).toContain('<textarea>Exact source.</textarea>');
    expect(inline).not.toContain('role="note"');
  });
  it('links a preview endnote back to its real marker without inventing links for pending notes', () => {
    const note: OrderedEntry = { type: 'text', logicalId: 'note', occurrenceId: 'note', format: 'footnote', footnoteLabel: '1', text: 'Source.' };
    const linked = renderToStaticMarkup(createElement(ConstitutionFootnotes, { entries: [note], idPrefix: 'editor-', backlinkIdPrefix: '', indexedBacklinks: new Map([['note', ['marker']]]) }));
    expect(linked).toContain('id="editor-fn-note"');
    expect(linked).toContain('href="#ref-marker"');
    expect(linked).toContain('Back to reference ↑');
    const pending = renderToStaticMarkup(createElement(ConstitutionFootnotes, { entries: [note], idPrefix: 'editor-' }));
    expect(pending).not.toContain('Back to reference');
  });
  it('localizes table and footnote navigation labels without changing authored text', () => {
    const content: OrderedEntry[] = [
      { type: 'text', logicalId: 'table', format: 'table', text: 'Original heading', table: { caption: '', rows: [{ logicalId: 'row', cells: [{ logicalId: 'cell', header: true, text: 'Original heading' }] }] } },
      { type: 'text', logicalId: 'note', format: 'footnote', text: 'Original source note' },
    ];
    const html = renderToStaticMarkup(createElement(TranslationProvider, { locale: 'de' }, createElement(OrderedContentTree, { entries: content, indexedBacklinks: new Map([['note', ['reference']]]) })));
    expect(html).toContain('aria-label="Rechtstabelle"');
    expect(html).toContain('aria-label="Zurück zum Fußnotenverweis 1"');
    expect(html).toContain('Original heading');
    expect(html).toContain('Original source note');
  });

  it('shares concatenated presentation between ordered previews and legacy readers', () => {
    const legacy = renderToStaticMarkup(createElement(NodeTree, { nodes, outline }));
    const ordered = renderToStaticMarkup(createElement(OrderedContentTree, { entries, outline }));
    expect(ordered.replace(/<[^>]*>/g, '')).toBe(legacy.replace(/<[^>]*>/g, ''));
    expect(ordered.replace(/<[^>]*>/g, '')).toContain('First. Second.');
    expect(ordered).toContain('id="0"');
    expect(ordered).toContain('id="1"');
    expect(ordered).not.toContain('Hidden title');
  });
  it('honors hidden labels and titles at root and child levels', () => {
    const hidden = { kinds: outline.kinds.map((kind) => ({ ...kind, presentation: 'section' })) };
    const html = renderToStaticMarkup(createElement(ConstitutionText, { article: { articleNumber: '46a', title: 'Hidden root', body: null, children: nodes }, outline: hidden }));
    expect(html).not.toContain('46a');
    expect(html).not.toContain('Hidden root');
    expect(html).not.toContain('(0)');
    expect(html).not.toContain('Hidden title');
  });
  it('shows inline literal labels on structural nodes without body text', () => {
    const inline = { kinds: outline.kinds.map((kind) => ({ ...kind, presentation: 'section', showLabel: true, labelPlacement: 'inline' })) };
    const html = renderToStaticMarkup(createElement(NodeTree, { nodes: [{ ...nodes[0]!, body: null, children: [nodes[1]!] }], outline: inline }));
    expect(html).toContain('<span class="num">(0)</span>');
    expect(html).toContain('<span class="num">(1)</span>');
  });
  it('renders mixed parent text once in stored order', () => {
    const html = renderToStaticMarkup(createElement(ConstitutionText, { article: { articleNumber: '46a', title: 'Hidden root', body: 'WRONG PROJECTION', children: nodes, content: [{ type: 'text', text: 'Before.' }, entries[0]!, { type: 'text', text: 'Between.' }, entries[1]!, { type: 'text', text: 'After.' }] }, outline }));
    expect(html).not.toContain('WRONG PROJECTION');
    expect(html.replace(/<[^>]*>/g, '')).toBe('Before.First.Between.Second.After.');
  });
  it('preserves literal superscript labels on concatenated leaves', () => {
    const labeled = { kinds: outline.kinds.map((kind) => ({ ...kind, showLabel: kind.kindCode === 'sentence', labelPlacement: 'superscript' })) };
    const html = renderToStaticMarkup(createElement(OrderedContentTree, { entries, outline: labeled }));
    expect(html).toContain('<sup class="num">(0)</sup>');
    expect(html).toContain('<sup class="num">(1)</sup>');
    expect(html).toContain('constitution-concat');
  });

  it('shows effective superscript labels in legacy reader and compare text', () => {
    const labeled = { kinds: outline.kinds.map((kind) => ({ ...kind, showLabel: kind.kindCode === 'sentence', labelPlacement: 'superscript' })) };
    const legacy = renderToStaticMarkup(createElement(NodeTree, { nodes, outline: labeled }));
    expect(legacy).toContain('<sup class="num">(0)</sup>');
    expect(legacy).toContain('<sup class="num">(1)</sup>');
    const left = { articleNumber: '1', title: '', children: nodes, legacyIdentity: true };
    const right = { ...left, children: [{ ...nodes[0]!, label: '(2a)' }, nodes[1]!] };
    const compared = renderToStaticMarkup(createElement(DiffConstitutionText, { left, right, side: 'to', outline: labeled }));
    expect(compared).toContain('<sup class="num">');
    expect(compared).toContain('(2a)');
  });

  it('retains legacy children when a running-text parent has descendants', () => {
    const parent = { ...nodes[0]!, children: [nodes[1]!] };
    const reader = renderToStaticMarkup(createElement(NodeTree, { nodes: [parent], outline }));
    const article = { articleNumber: '1', title: '', children: [parent], legacyIdentity: true };
    const compared = renderToStaticMarkup(createElement(DiffConstitutionText, { left: article, right: article, side: 'to', outline }));
    expect(reader).toContain('Second.');
    expect(compared).toContain('Second.');
  });

});


describe('ordered occurrence anchors', () => {
  it('anchors every adjacent text fragment while preserving exact split bytes', () => {
    const html = renderToStaticMarkup(createElement(OrderedContentTree, { entries: [
      { type: 'text', occurrenceId: 'first-text', text: 'un' },
      { type: 'text', occurrenceId: 'second-text', text: 'broken' },
    ], outline }));
    expect(html).toContain('id="first-text"');
    expect(html).toContain('id="second-text"');
    expect(html.replace(/<[^>]*>/g, '')).toBe('unbroken');
  });
  it('retains an inline root literal label with ordered content', () => {
    const inline = { kinds: outline.kinds.map((kind) => ({ ...kind, showLabel: true, labelPlacement: 'inline' })) };
    const html = renderToStaticMarkup(createElement(ConstitutionText, { article: { articleNumber: '46a', title: '', content: [{ type: 'text', text: 'Rights.' }] }, outline: inline }));
    expect(html).toContain('<span class="num">46a</span>');
    expect(html.replace(/<[^>]*>/g, '')).toBe('46aRights.');
  });
});


describe('root literal label diffs', () => {
  it.each(['inline', 'superscript'])('marks renumbering with %s root labels', (placement) => {
    const labeled = { kinds: [{ ...outline.kinds[0]!, showLabel: true, labelPlacement: placement }] };
    const left = { articleNumber: '46a', title: '', kind: 'article', content: [{ type: 'text', logicalId: 'text', text: 'Unchanged rights.' }] };
    const right = { ...left, articleNumber: 'bis' };
    const from = renderToStaticMarkup(createElement(DiffConstitutionText, { left, right, side: 'from', outline: labeled }));
    const to = renderToStaticMarkup(createElement(DiffConstitutionText, { left, right, side: 'to', outline: labeled }));
    const tag = placement === 'inline' ? 'span' : 'sup';
    expect(from).toContain(`<${tag} class="num"><del class="diff-remove">46a</del></${tag}>`);
    expect(to).toContain(`<${tag} class="num"><ins class="diff-add">bis</ins></${tag}>`);
    expect(from.replace(/<[^>]*>/g, '')).toBe('46aUnchanged rights.');
    expect(to.replace(/<[^>]*>/g, '')).toBe('bisUnchanged rights.');
  });
});


describe('ordered title authoring permissions', () => {
  it('forwards title controls even when public titles are hidden and leaves concatenate', () => {
    vi.mocked(NodeTitleForm).mockClear();
    renderToStaticMarkup(createElement(ConstitutionText, { entries, outline, canEditTitles: true, returnTo: '/reader' }));
    const calls = vi.mocked(NodeTitleForm).mock.calls;
    expect(calls.map(([props]) => props.nodeId)).toEqual(['0', '1']);
    expect(calls.every(([props]) => props.returnTo === '/reader')).toBe(true);
  });
  it('does not offer title authoring when the structural title policy forbids titles', () => {
    vi.mocked(NodeTitleForm).mockClear();
    const forbidden = { kinds: outline.kinds.map((kind) => ({ ...kind, titlePolicy: 'none' })) };
    renderToStaticMarkup(createElement(ConstitutionText, { entries, outline: forbidden, canEditTitles: true, returnTo: '/reader' }));
    expect(NodeTitleForm).not.toHaveBeenCalled();
  });
});


it('retains unchanged legacy descendant text within a changed root', () => {
  const leaf = (prefix: string, text: string) => ({ type: 'child' as const, node: { logicalId: prefix, revisionId: prefix, occurrenceId: prefix, kind: 'sentence', label: '(2a)', title: null, content: [{ type: 'text' as const, logicalId: `${prefix}-text`, occurrenceId: `${prefix}-text`, text }] } });
  const left = { articleNumber: '46a', title: 'Rights', legacyIdentity: true, content: [leaf('old', 'Unchanged clause. Old ending.')] };
  const right = { ...left, content: [leaf('new', 'Unchanged clause. New ending.')] };
  const html = renderToStaticMarkup(createElement(DiffConstitutionText, { left, right, side: 'from', outline }));
  expect(html).toContain('<span>Unchanged clause. </span>');
  expect(html).not.toContain('<del class="diff-remove">Unchanged clause.');
  expect(html).toContain('diff-remove');
});
