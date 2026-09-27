import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ContentNode, ContentOutline, OrderedEntry } from './api';
vi.mock('../app/components/NodeTitleForm', () => ({ NodeTitleForm: vi.fn(() => null) }));
import { NodeTitleForm } from '../app/components/NodeTitleForm';
import { DiffConstitutionText } from '../app/components/DiffConstitutionText';
import { ConstitutionText, NodeTree, OrderedContentTree } from '../app/components/ConstitutionText';
const outline: ContentOutline = { kinds: [
  { kindCode: 'article', displayLabel: 'Article', sortOrder: 1, mayHoldText: true, mayHoldChildren: true, allowedChildKinds: ['sentence'], showLabel: false, showTitle: false, showKind: false, presentation: 'section' },
  { kindCode: 'sentence', displayLabel: 'Sentence', sortOrder: 2, mayHoldText: true, mayHoldChildren: false, allowedChildKinds: [], showLabel: false, showTitle: false, showKind: false, presentation: 'concatenated' },
] };
const nodes: ContentNode[] = ['First.', 'Second.'].map((body, index) => ({ id: `${index}`, kind: 'sentence', label: `(${index})`, number: null, title: 'Hidden title', body, sortOrder: index, children: [] }));
const entries: OrderedEntry[] = nodes.map((node) => ({ type: 'child', node: { logicalId: node.id, revisionId: node.id, occurrenceId: node.id, kind: node.kind, label: node.label, title: node.title, content: [{ type: 'text', text: node.body }] } }));
describe('reader presentation', () => {
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
