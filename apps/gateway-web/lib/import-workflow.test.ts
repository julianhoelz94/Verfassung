import { describe, expect, it } from 'vitest';
import { importActions, importPhase } from './import-workflow';

describe('import workflow', () => {
  const prepared = { status: 'pending_review', versionId: 'draft' };
  it('moves from preparation through review to publication with one next action group', () => {
    expect(importPhase({ status: 'pending_review', versionId: null })).toBe('prepare');
    expect(importPhase(prepared)).toBe('review');
    expect(importActions(prepared, ['admin'], false)).toEqual(['approve', 'reject']);
    expect(importPhase({ ...prepared, status: 'approved' })).toBe('approved');
    expect(importActions({ ...prepared, status: 'approved' }, ['admin'], false)).toEqual(['publish']);
    for (const status of ['completed', 'rejected', 'failed', 'publishing']) {
      expect(importActions({ ...prepared, status }, ['admin'], false)).toEqual([]);
    }
  });
  it('preserves role boundaries and outline confirmation', () => {
    expect(importActions({ status: 'pending_review', versionId: null }, ['editor'], true)).toEqual(['confirm-outline']);
    expect(importActions({ status: 'pending_review', versionId: null, outlineConfirmedBy: 'editor' }, ['editor'], true)).toEqual(['prepare']);
    expect(importActions({ ...prepared, status: 'approved' }, ['reviewer'], false)).toEqual([]);
    expect(importActions(prepared, ['publisher'], false)).toEqual([]);
    expect(importActions(prepared, [], false)).toEqual([]);
  });
  it('fails closed on an unknown status', () => {
    expect(importPhase({ ...prepared, status: 'toString' })).toBe('unavailable');
    expect(importActions({ ...prepared, status: 'unknown' }, ['admin'], false)).toEqual([]);
  });
});
