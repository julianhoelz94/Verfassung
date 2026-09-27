import { describe, expect, it } from 'vitest';
import { applyOperation, draftDifferences, sentenceParts, validateDraft, type DraftNode } from './structured-editor';
import type { ContentOutline } from './api';
const outline: ContentOutline = { kinds: [
  { kindCode: 'clause', displayLabel: 'Clause', sortOrder: 0, mayHoldText: true, mayHoldChildren: true, allowedChildKinds: ['sentence'], presentation: 'section', showLabel: true, showTitle: true, showKind: true, labelPolicy: 'required' },
  { kindCode: 'sentence', displayLabel: 'Sentence', sortOrder: 1, mayHoldText: true, mayHoldChildren: false, allowedChildKinds: [], presentation: 'concatenated', showLabel: false, showTitle: false, showKind: false },
] };
const root: DraftNode = { logicalId: 'root', revisionId: 'r0', kind: 'clause', label: '46a', content: [
  { type: 'text', logicalId: 'before', revisionId: 'r1', text: 'Before. ' },
  { type: 'child', node: { logicalId: 'sentence', revisionId: 'r2', kind: 'sentence', label: '(2a)', content: [{ type: 'text', logicalId: 'wording', revisionId: 'r3', text: 'Original.' }] } },
  { type: 'text', logicalId: 'after', revisionId: 'r4', text: ' After.' },
] };
describe('ordered editorial commands', () => {
  it('edits one entry and preserves parent text and child identity', () => {
    const next = applyOperation([root], { id: 'op', type: 'replace_text', targetId: 'wording', expectedRevisionId: 'r3', text: 'Changed.' });
    expect(next[0].content[0]).toBe(root.content[0]);
    expect(next[0].content[2]).toBe(root.content[2]);
    expect(next[0].content[1].node?.label).toBe('(2a)');
    expect(draftDifferences([root], next)).toEqual([expect.objectContaining({ logicalId: 'wording', field: 'text', before: 'Original.', after: 'Changed.' })]);
  });
  it('cannot merge across a child boundary', () => {
    expect(() => applyOperation([root], { id: 'op', type: 'merge_text', targetId: 'before', expectedRevisionId: 'r1', mergeIds: ['before', 'after'], parts: [{ logicalId: 'merged', text: 'Before.  After.' }] })).toThrow('child boundary');
  });
  it('proposes lossless boundaries for pasted text', () => {
    for (const text of ['One. Two!\nThree?', ' Dr. Example. Next.', 'plain', '']) expect(sentenceParts(text).join('')).toBe(text);
  });
  it('checks required literal labels and parent text capabilities', () => {
    expect(validateDraft([root], outline)).toEqual([]);
    expect(validateDraft([{ ...root, label: '' }], outline)).toContain('Clause: label is required.');
    expect(validateDraft([root], { kinds: [{ ...outline.kinds[0], mayHoldText: false }, outline.kinds[1]] })).toContain('Clause 46a: invalid text entry.');
  });
  it('records split lineage as removal and insertion with exact bytes', () => {
    const next = applyOperation([root], { id: 'op', type: 'split_text', targetId: 'before', expectedRevisionId: 'r1', parts: [{ logicalId: 'a', text: 'Before.' }, { logicalId: 'b', text: ' ' }] });
    expect(next[0].content.slice(0, 2).map(entry => entry.text).join('')).toBe('Before. ');
    expect(draftDifferences([root], next).filter(change => change.field === 'inserted')).toHaveLength(2);
  });
});
