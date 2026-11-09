import { describe, expect, it } from 'vitest';
import type { ConstitutionLifecycleEvent } from './api';
import { effectiveLifecycle, flattenLifecycleUnits, lifecycleDate, lifecycleEntries, nextLifecycleEvents } from './lifecycle-workspace';

const adopted: ConstitutionLifecycleEvent = { id: 'adopted', constitutionId: 'constitution', eventType: 'adopted', eventDate: '1949-05-08', dateCertainty: 'exact', note: null, sourceUrl: null };

describe('lifecycle workspace legal history', () => {
  it('offers only valid whole-constitution transitions, including the terminal repeal', () => {
    expect(nextLifecycleEvents()).toEqual(['adopted']);
    expect(nextLifecycleEvents(adopted)).toEqual(['commenced', 'repealed']);
    expect(nextLifecycleEvents({ ...adopted, eventType: 'commenced' })).toEqual(['suspended', 'repealed']);
    expect(nextLifecycleEvents({ ...adopted, eventType: 'suspended' })).toEqual(['restored', 'repealed']);
    expect(nextLifecycleEvents({ ...adopted, eventType: 'repealed' })).toEqual([]);
  });
  it('keeps future status changes out of the current status while retaining them in history', () => {
    const future = { ...adopted, id: 'future', eventType: 'repealed' as const, eventDate: '2099-01-01' };
    const events = [future, adopted];
    expect(effectiveLifecycle(events, '2026-11-09')).toEqual(adopted);
    expect(lifecycleEntries(events, []).map(event => event.id)).toEqual(['future', 'adopted']);
    expect(effectiveLifecycle(events, '1940-01-01')).toBeUndefined();
    expect(events[0]).toEqual(future);
  });
  it('retains exact nested provision IDs, paths and searchable wording without selecting descendants', () => {
    expect(flattenLifecycleUnits([{ logicalId: 'article', kind: 'Article', label: '1', content: [{ type: 'child', node: { logicalId: 'sentence', kind: 'Sentence', label: '2', content: [{ type: 'text', text: 'Human dignity' }] } }] }])).toEqual([
      { id: 'article', label: 'Article · 1', path: 'Article · 1', depth: 0, text: '' },
      { id: 'sentence', label: 'Sentence · 2', path: 'Article · 1 / Sentence · 2', depth: 1, text: 'Human dignity' },
    ]);
    expect(lifecycleDate('1949-05-08', 'de', true)).toMatch(/^ca\. 8\. Mai 1949$/);
  });
});
