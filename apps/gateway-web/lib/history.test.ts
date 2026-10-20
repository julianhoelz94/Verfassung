import { describe, expect, it } from 'vitest';
import { historyFilter, sortHistory } from './history';

describe('combined history', () => {
  it('interleaves lifecycle events and amendments chronologically with undated records last', () => {
    const items = [
      { id: 'restoration', date: '2000-01-01', kind: 'constitution' as const },
      { id: 'undated', date: null, kind: 'amendment' as const },
      { id: 'change', date: '1950-01-01', kind: 'amendment' as const },
      { id: 'adoption', date: '1949-01-01', kind: 'constitution' as const },
    ];
    expect(sortHistory(items).map(item => item.id)).toEqual(['adoption', 'change', 'restoration', 'undated']);
    expect(items[0].id).toBe('restoration');
  });
  it('orders coincident events deterministically and defaults invalid filters to all events', () => {
    expect(sortHistory([
      { id: 'b', date: '1949-01-01', kind: 'constitution' as const },
      { id: 'a', date: '1949-01-01', kind: 'constitution' as const },
    ]).map(item => item.id)).toEqual(['a', 'b']);
    expect([undefined, 'unknown', 'all', 'constitution', 'amendment'].map(historyFilter)).toEqual(['all', 'all', 'all', 'constitution', 'amendment']);
  });
});
