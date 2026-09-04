import { describe, expect, it } from 'vitest';
import type { Amendment } from './api';
import { sortAmendmentsByEnactment } from './timeline';

const amendment = (id: string, title: string, enactedOn: string | null): Amendment => ({
  id,
  title,
  summary: '',
  enactedOn,
  sourceReference: null,
  sourceVersionId: 'from',
  targetVersionId: 'to',
  changes: [],
});

describe('sortAmendmentsByEnactment', () => {
  it('sorts by enactment date with unknown dates last', () => {
    const sorted = sortAmendmentsByEnactment([
      amendment('c', 'Later', '1956-03-19'),
      amendment('u', 'Undated', null),
      amendment('a', 'First', '1949-05-23'),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['a', 'c', 'u']);
  });
});
