import { describe, expect, it } from 'vitest';
import { alignNodes, diffText, segsForSide, splitSentences } from './text-diff';
import type { ContentNode } from './api';

const node = (partial: Partial<ContentNode> & Pick<ContentNode, 'id' | 'kind'>): ContentNode => ({
  label: null,
  number: null,
  title: null,
  body: null,
  sortOrder: 1,
  children: [],
  ...partial,
});

describe('splitSentences', () => {
  it('keeps a single sentence intact', () => {
    expect(splitSentences('Human dignity shall be inviolable.')).toEqual(['Human dignity shall be inviolable.']);
  });

  it('splits on sentence boundaries', () => {
    expect(splitSentences('One. Two! Three?')).toEqual(['One.', 'Two!', 'Three?']);
  });
});

describe('diffText', () => {
  it('marks a changed sentence as a replacement', () => {
    const segs = diffText(
      'Human dignity shall be inviolable. Old second sentence.',
      'Human dignity shall be inviolable. New second sentence.',
    );
    expect(segs.some((seg) => seg.type === 'remove' && seg.text.includes('Old'))).toBe(true);
    expect(segs.some((seg) => seg.type === 'add' && seg.text.includes('New'))).toBe(true);
    expect(segsForSide(segs, 'from').every((seg) => seg.type !== 'add')).toBe(true);
    expect(segsForSide(segs, 'to').every((seg) => seg.type !== 'remove')).toBe(true);
  });

  it('marks a whole-article replacement', () => {
    const segs = diffText('The old article body.', 'The new article body.');
    expect(segs.some((seg) => seg.type === 'remove' && seg.text.includes('old'))).toBe(true);
    expect(segs.some((seg) => seg.type === 'add' && seg.text.includes('new'))).toBe(true);
  });
});

describe('alignNodes', () => {
  it('matches sub-article nodes by id and reports unmatched sides', () => {
    const left = [node({ id: 'p1', kind: 'paragraph', label: '(1)', body: 'Old.' })];
    const right = [
      node({ id: 'p1', kind: 'paragraph', label: '(1)', body: 'New.' }),
      node({ id: 'p2', kind: 'paragraph', label: '(2)', body: 'Added.' }),
    ];
    const aligned = alignNodes(left, right);
    expect(aligned).toHaveLength(2);
    expect(aligned[0]?.left?.id).toBe('p1');
    expect(aligned[0]?.right?.id).toBe('p1');
    expect(aligned[1]?.right?.id).toBe('p2');
  });

  it('does not treat Abs. or Art. as sentence boundaries when one sentence node changes', () => {
    const left = [
      node({ id: 's1', kind: 'sentence', label: '1', body: 'Art. 1 Abs. 1 remains.' }),
      node({ id: 's2', kind: 'sentence', label: '2', body: 'Art. 1 Abs. 2 is old.' }),
    ];
    const right = [
      node({ id: 's1', kind: 'sentence', label: '1', body: 'Art. 1 Abs. 1 remains.' }),
      node({ id: 's2', kind: 'sentence', label: '2', body: 'Art. 1 Abs. 2 is new.' }),
    ];
    const aligned = alignNodes(left, right);
    expect(aligned).toHaveLength(2);
    const changed = diffText(aligned[1]?.left?.body ?? '', aligned[1]?.right?.body ?? '');
    expect(changed.some((seg) => seg.type === 'equal' && seg.text.includes('Abs.'))).toBe(true);
    expect(changed.some((seg) => seg.type === 'remove' && seg.text.includes('old'))).toBe(true);
    expect(changed.some((seg) => seg.type === 'add' && seg.text.includes('new'))).toBe(true);
    expect(changed.every((seg) => !seg.text.includes('Art.') || seg.type === 'equal')).toBe(true);
  });
});

describe('diffText word-diff', () => {
  it('word-diffs a single unsplit paragraph', () => {
    const segs = diffText('Human dignity shall be inviolable.', 'Human dignity shall be protected.');
    expect(segs.some((seg) => seg.type === 'equal' && seg.text.includes('Human dignity shall be'))).toBe(true);
    expect(segs.some((seg) => seg.type === 'remove' && seg.text.includes('inviolable'))).toBe(true);
    expect(segs.some((seg) => seg.type === 'add' && seg.text.includes('protected'))).toBe(true);
  });
});
