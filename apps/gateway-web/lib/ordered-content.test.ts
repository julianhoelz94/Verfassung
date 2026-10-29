import { describe, expect, it } from 'vitest';
import { orderedText, orderedTargets } from './ordered-content';
import type { OrderedEntry } from './api';
const child: OrderedEntry = { type: 'child', node: { logicalId: 'logical', revisionId: 'revision', occurrenceId: 'occurrence', kind: 'sentence', label: '(2a)', title: 'Metadata', content: [{ type: 'text', text: 'inside.\n' }] } };
describe('ordered text contract', () => {
  it('preserves text before and after children and stored whitespace', () => {
    expect(orderedText([{ type: 'text', text: 'before  ' }, child, { type: 'text', text: 'after' }])).toBe('before  inside.\nafter');
  });
  it('concatenates adjacent text exactly so split and merge preserve text', () => {
    expect(orderedText([{ type: 'text', text: 'one.' }, { type: 'text', text: '' }, { type: 'text', text: 'Two.' }])).toBe('one.Two.');
  });
  it('includes authored separators between clean sentence nodes in exported text', () => {
    const sentence = (text: string, lineBreaksBefore = 0): OrderedEntry => ({ ...child, node: { ...child.node!, content: [{ type: 'text', text, lineBreaksBefore }] } });
    expect(orderedText([sentence('First.'), sentence('Second.', 2), sentence('Third.')])).toBe('First.\n\nSecond. Third.');
  });
  it('preserves an explicit separator between adjacent fragments and at the start', () => {
    expect(orderedText([{ type: 'text', text: 'First.', lineBreaksBefore: 1 }, { type: 'text', text: 'Second.', lineBreaksBefore: 2 }])).toBe('\nFirst.\n\nSecond.');
  });
  it('pins text-entry and nested node references to their actual root occurrence', () => {
    const root = { id: 'root-occurrence', logicalId: 'root-logical', content: [{ ...child, node: { ...child.node!, content: [{ type: 'text' as const, logicalId: 'text-logical', occurrenceId: 'text-occurrence', text: 'Exact source.' }] } }] };
    expect(orderedTargets([root])).toEqual({
      'root-logical': { rootId: 'root-occurrence', occurrenceId: 'root-occurrence' },
      logical: { rootId: 'root-occurrence', occurrenceId: 'occurrence' },
      'text-logical': { rootId: 'root-occurrence', occurrenceId: 'text-occurrence' },
    });
  });
});
