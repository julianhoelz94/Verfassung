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
});
