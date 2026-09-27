import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ContentNode, ContentOutline, OrderedEntry } from './api';
vi.mock('../app/components/NodeTitleForm', () => ({ NodeTitleForm: () => null }));
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
    expect(ordered).toBe(legacy);
    expect(ordered).toContain('First. Second.');
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
});
