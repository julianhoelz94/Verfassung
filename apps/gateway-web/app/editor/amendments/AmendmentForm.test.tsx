import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, getByLabelText, getByRole } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Amendment, VersionSummary } from '../../../lib/api';
import type { DiffReviewState } from '../../../lib/diff-review';
import { fetchWithTimeout } from '../../../lib/fetch-with-timeout';
import { AmendmentForm } from './AmendmentForm';
import { suggestChangesAction } from './actions';

vi.mock('./actions', () => ({ suggestChangesAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../../../lib/fetch-with-timeout', () => ({ fetchWithTimeout: vi.fn() }));
const beforeRef = { versionId: 'source', logicalId: 'article', occurrenceId: 'before', revisionId: 'before-revision', text: 'Before.' };
const afterRef = { versionId: 'target', logicalId: 'article', occurrenceId: 'after', revisionId: 'after-revision', text: 'After.' };
const amendment: Amendment = { id: 'law', title: 'Enacting law', summary: '', enactedOn: null, sourceReference: null, comment: 'Saved public comment', sourceVersionId: 'source', targetVersionId: 'target', changes: [{ id: 'saved-change', articleId: null, articleNumber: '1', changeType: 'changed', note: 'Curated note', beforeRef, afterRef }] };
const versions = ['source', 'target', 'later'].map(id => ({ id, versionLabel: id, listing: 'public' } as VersionSummary));
const review: DiffReviewState = { revisionId: 'review', sourceVersionId: 'source', targetVersionId: 'target', candidates: [{ key: 'difference', fingerprint: 'fingerprint', facet: 'text_changed', level: 1, ambiguous: false, groupKey: null, beforeRefs: [{ ...beforeRef, kind: 'node', path: ['Article 1'], label: '1', excerpt: 'Before.' }], afterRefs: [{ ...afterRef, kind: 'node', path: ['Article 1'], label: '1', excerpt: 'After.' }] }], decisions: [], totals: { total: 1, resolved: 0 }, currentPosition: 1 };
let host: HTMLDivElement, root: Root;
const click = async (name: string) => act(async () => { fireEvent.click(getByRole(host, 'button', { name, exact: true })); });
const changes = () => JSON.parse(host.querySelector<HTMLInputElement>('[name="changesJson"]')!.value);
const field = (label: string) => getByLabelText(host, label, { exact: true }) as HTMLInputElement;
const task = async (name: string) => act(async () => { fireEvent.click(getByRole(getByRole(host, 'navigation', { name: 'Amendment workspace' }), 'button', { name: new RegExp(`^${name}( \\([0-9]+\\))?$`) })); });
const dialogMethods = ['showModal', 'close'] as const;
const originalDialogMethods = Object.getOwnPropertyDescriptors(HTMLDialogElement.prototype);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks(); window.history.replaceState(null, '', '/editor/amendments/law');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0; });
  for (const method of dialogMethods) Object.defineProperty(HTMLDialogElement.prototype, method, { configurable: true, value: function (this: HTMLDialogElement) { this.open = method === 'showModal'; } });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  for (const method of dialogMethods) { if (originalDialogMethods[method]) Object.defineProperty(HTMLDialogElement.prototype, method, originalDialogMethods[method]); else Reflect.deleteProperty(HTMLDialogElement.prototype, method); }
});
async function render(props: Partial<Parameters<typeof AmendmentForm>[0]> = {}) {
  await act(async () => root.render(<AmendmentForm amendmentId="law" constitutionId="constitution" amendment={amendment} versions={versions} articlesByVersion={{}} unitTreesByVersion={{}} canSave canWithdraw={false} canPublish readOnly={false} diffReview={review} canReviewDiff {...props} />));
}

describe('amendment-wide draft contract', () => {
  it('preserves the public comment and old passage references when changing the constitution-wide pair', async () => {
    await render(); await act(async () => { fireEvent.input(field('Public amendment comment'), { target: { value: 'Unsaved public explanation' } }); });
    const leaving = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(leaving); expect(leaving.defaultPrevented).toBe(true);
    await click('Choose constitution versions');
    await act(async () => { fireEvent.change(field('Before constitution'), { target: { value: 'later' } }); fireEvent.change(field('After constitution'), { target: { value: 'later' } }); });
    expect((getByRole(host, 'button', { name: 'Use this pair' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.change(field('After constitution'), { target: { value: 'target' } }); });
    await click('Use this pair');
    expect(host.querySelector<HTMLInputElement>('[name="sourceVersionId"]')!.value).toBe('later');
    expect(changes()[0]).toMatchObject({ beforeRef, afterRef, note: 'Curated note' });
    expect(host.textContent).toContain('Correct its mapping before saving');
    await task('Documents'); await task('History'); await task('Affected passages');
    expect(field('Public amendment comment').value).toBe('Unsaved public explanation');
    await task('Review'); expect(host.textContent).toContain('Save the new constitution pair before reviewing its differences.');
    await task('Publication'); expect((getByRole(host, 'button', { name: 'Publish law' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('adds suggested passages without replacing curated notes or duplicating existing mappings', async () => {
    vi.mocked(suggestChangesAction).mockResolvedValue({ changes: [{ articleNumber: '1', changeType: 'changed', note: 'Generated note', beforeRef, afterRef }, { articleNumber: '2', changeType: 'added', note: 'Added wording', afterRef: { ...afterRef, logicalId: 'new-article', occurrenceId: 'new-after' } }] } as never);
    await render(); await click('Find affected passages');
    expect(suggestChangesAction).toHaveBeenCalledWith('source', 'target');
    expect(changes()).toHaveLength(2); expect(changes()[0].note).toBe('Curated note'); expect(changes()[1].articleNumber).toBe('2');
    vi.mocked(suggestChangesAction).mockResolvedValue({ error: 'Comparison unavailable' });
    await click('Find affected passages'); expect(getByRole(host, 'alert').textContent).toBe('Comparison unavailable'); expect(changes()).toHaveLength(2);
  });

  it('retains entered values after rejected and unconfirmed saves, without issuing publication', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(Response.json({ key: 'title' }, { status: 400 })).mockRejectedValueOnce(new Error('connection lost'));
    await render(); await act(async () => { fireEvent.input(field('Public amendment comment'), { target: { value: 'Unsaved rationale' } }); fireEvent.submit(host.querySelector('#amendment-draft-form')!); });
    expect(field('Title').value).toBe('Enacting law');
    await task('Affected passages'); expect(field('Public amendment comment').value).toBe('Unsaved rationale');
    await act(async () => { fireEvent.submit(host.querySelector('#amendment-draft-form')!); });
    expect(getByRole(host, 'alert').textContent).toContain('Saving could not be confirmed');
    expect(field('Public amendment comment').value).toBe('Unsaved rationale');
    for (const call of vi.mocked(fetchWithTimeout).mock.calls) {
      const data = call[1]!.body as FormData;
      expect(data.get('command')).toBe('amendment-save'); expect(data.get('comment')).toBe('Unsaved rationale');
      expect(JSON.parse(String(data.get('changesJson')))[0]).toMatchObject({ beforeRef, afterRef });
    }
  });

  it('creates a passage from a detected difference while keeping review links limited to saved entries', async () => {
    await render(); await task('Review');
    const savedOptions = [...field('Link to saved change rows').querySelectorAll('option')].map(option => option.value);
    expect(savedOptions).toEqual(['saved-change']);
    await click('Create change row from this difference'); expect(changes()).toHaveLength(2);
    expect(changes()[1]).toMatchObject({ beforeRef: { versionId: 'source', logicalId: 'article' }, afterRef: { versionId: 'target', logicalId: 'article' } });
    await task('Review'); expect([...field('Link to saved change rows').querySelectorAll('option')].map(option => option.value)).toEqual(['saved-change']);
    await task('Publication'); expect((getByRole(host, 'button', { name: 'Publish law' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
