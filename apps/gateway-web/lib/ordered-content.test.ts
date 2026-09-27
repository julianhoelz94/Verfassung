import { describe, expect, it } from 'vitest';
import { orderedText } from './ordered-content';
import type { OrderedEntry } from './api';
const child: OrderedEntry = { type: 'child', node: { logicalId: 'logical', revisionId: 'revision', occurrenceId: 'occurrence', kind: 'sentence', label: '(2a)', title: 'Metadata', content: [{ type: 'text', text: 'inside.\n' }] } };
describe('ordered text contract', () => {
  it('preserves text before and after children and stored whitespace', () => {
    expect(orderedText([{ type: 'text', text: 'before  ' }, child, { type: 'text', text: 'after' }])).toBe('before  inside.\nafter');
  });
  it('adds only missing boundary spaces and ignores empty fragments', () => {
    expect(orderedText([{ type: 'text', text: 'one.' }, { type: 'text', text: '' }, { type: 'text', text: 'Two.' }])).toBe('one. Two.');
  });
});
