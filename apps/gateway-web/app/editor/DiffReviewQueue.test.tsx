import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as axeCore from 'axe-core';
import type { DiffReviewState, ReviewCandidate } from '../../lib/diff-review';
import { DiffReviewQueue } from './DiffReviewQueue';

const actions = vi.hoisted(() => ({
  refresh: vi.fn(),
  save: vi.fn(),
}));
vi.mock('./diff-review-actions', () => ({ refreshDiffReviewAction: actions.refresh, saveDiffDecisionAction: actions.save }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const axeRun = typeof axeCore.run === 'function' ? axeCore.run.bind(axeCore) : (axeCore as unknown as { default: { run: typeof axeCore.run } }).default.run;

function candidate(key: string, branch: string, before: string, after: string): ReviewCandidate {
  const ref = (text: string) => ({ versionId: 'version', logicalId: `${key}-${text}`, revisionId: key, occurrenceId: key, kind: 'text_entry', label: null, path: [branch, 'Sentence 1'], excerpt: text });
  return { key, fingerprint: `fingerprint-${key}`, facet: 'text_changed', level: 2, beforeRefs: [ref(before)], afterRefs: [ref(after)], ambiguous: false, groupKey: null };
}
function state(candidates: ReviewCandidate[]): DiffReviewState {
  return { revisionId: 'revision', sourceVersionId: 'source', targetVersionId: 'target', candidates, decisions: candidates.map(({ key, fingerprint }) => ({ key, fingerprint, status: 'open', linkedChangeIds: [], reason: null, reviewerAcknowledged: false })), totals: { total: candidates.length, resolved: 0 }, currentPosition: candidates.length ? 1 : null };
}

describe('guided difference review', () => {
  let host: HTMLElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('main'); document.body.append(host); root = createRoot(host);
    actions.refresh.mockReset(); actions.save.mockReset();
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
  async function mount(review: DiffReviewState, canAcknowledge = true) {
    await act(async () => root.render(<DiffReviewQueue target={{ kind: 'amendment', id: 'amendment' }} initial={review} rows={[]} canDecide canAcknowledge={canAcknowledge} />));
  }
  function button(name: string): HTMLButtonElement {
    const found = [...host.querySelectorAll('button')].find((item) => item.textContent === name);
    expect(found, `button ${name}`).toBeDefined(); return found!;
  }

  it('keeps global progress while filtering two branches and navigating by keyboard', async () => {
    await mount(state([candidate('eight', 'Article 8', 'Old right', 'New right'), candidate('twelve', 'Article 12', 'Old duty', 'New duty')]));
    expect(host.textContent).toContain('Reviewed 0 of 2');
    expect(host.textContent).toContain('Article 8: 1 open');
    expect(host.textContent).toContain('Article 12: 1 open');
    expect(host.textContent).toContain('Level 2: 0 of 2 reviewed');
    expect(host.textContent).toContain('Difference 1 of 2');
    await act(async () => button('Next').click());
    expect(host.textContent).toContain('Difference 2 of 2');
    expect(host.textContent).toContain('Old duty');
    expect(host.querySelectorAll('del')).toHaveLength(1);
    expect(host.querySelectorAll('ins')).toHaveLength(1);
    const progress = host.querySelector('progress')!;
    expect(progress.value).toBe(0);
    expect(progress.max).toBe(2);
    expect(progress.getAttribute('aria-label')).toBe('Reviewed 0 of 2 differences');
    const result = await axeRun(host, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((violation) => violation.id)).toEqual([]);
  });

  it('advances the editor to the next open finding after an exclusion proposal', async () => {
    const initial = state([candidate('eight', 'Article 8', 'Old right', 'New right'), candidate('twelve', 'Article 12', 'Old duty', 'New duty')]);
    actions.save.mockResolvedValue({ review: { ...initial, decisions: [{ ...initial.decisions[0], status: 'excluded_with_reason', reason: 'Separate legal record' }, initial.decisions[1]] } });
    await mount(initial, false);
    await act(async () => {
      const reason = host.querySelector('textarea')!;
      reason.value = 'Separate legal record';
      Simulate.change(reason);
    });
    await act(async () => button('Exclude with reason and next').click());
    expect(host.textContent).toContain('Difference 2 of 2');
    expect(host.textContent).toContain('1 of 2 ready for reviewer handoff');
    expect(host.textContent).toContain('Reviewed 0 of 2');
  });

  it('saves an acknowledged exclusion and restores progress from the saved state', async () => {
    const initial = state([candidate('eight', 'Article 8', 'Old', 'New')]);
    actions.save.mockResolvedValue({ review: { ...initial, decisions: [{ ...initial.decisions[0], status: 'excluded_with_reason', reason: 'Editorial correction', reviewerAcknowledged: true }], totals: { total: 1, resolved: 1 }, currentPosition: null } });
    await mount(initial);
    await act(async () => {
      const reason = host.querySelector('textarea')!;
      reason.value = 'Editorial correction';
      Simulate.change(reason);
    });
    await act(async () => { (host.querySelector('input[type="checkbox"]') as HTMLInputElement).click(); });
    await act(async () => button('Exclude with reason and next').click());
    expect(actions.save).toHaveBeenCalled();
    expect(host.textContent).toContain('Reviewed 1 of 1');
    expect(host.textContent).toContain('Decision saved.');
  });

  it('shows an accessible zero-difference state', async () => {
    await mount(state([]));
    expect(host.textContent).toContain('No differences found for the pinned snapshots.');
    expect(host.querySelector('progress')?.value).toBe(0);
  });
});
