import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, getByRole } from '@testing-library/dom';
import { mount, click } from '../../test/dom';
import { ReaderComparison } from './ReaderComparison';
import type { ReaderChange } from '../../lib/reader';
const publications = ['a','b','c'].map(id => ({ id: 'legal-' + id, snapshotId: id, versionLabel: id.toUpperCase(), effectiveDate: '2022-01-01' }));
const changes: ReaderChange[] = [
  { key: 'one', kind: 'changed', label: 'Article 1', fromRoot: 'old', toRoot: 'new', presentationOnly: false, segments: [{ type: 'equal', text: 'All ' }, { type: 'remove', text: 'men' }, { type: 'add', text: 'people' }] },
  { key: 'two', kind: 'removed', label: 'Article 2', fromRoot: 'removed', presentationOnly: false, segments: [{ type: 'remove', text: 'Removed.' }] },
  { key: 'three', kind: 'added', label: 'Article 3', toRoot: 'added', presentationOnly: true, segments: [] },
];
let view: Awaited<ReturnType<typeof mount>>;
afterEach(async () => { if(view) await view.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const props = { constitutionId: 'constitution', publications, viewedVersionId: 'b', readerHref: (id: string) => '/versions/' + id, comparisonHref: '/compare' };
function respond(items = changes) { vi.stubGlobal('fetch', vi.fn(async (url: string) => { const query = new URL(url, 'https://example.org').searchParams; return { ok: true, json: async () => ({ from: query.get('from'), to: query.get('to'), changes: items }) }; })); }
function control(name: string) { return getByRole(view.host, 'button', { name }); }
async function choose(name: string, value: string) { await act(async () => fireEvent.change(getByRole(view.host, 'combobox', { name }), { target: { value } })); }
it('compares exact snapshots, renders semantic insertions/deletions and navigates additions and removals', async () => {
  respond(); view = await mount(<ReaderComparison {...props} />);
  expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('from=a&to=b');
  expect(view.host.querySelector('ins')?.textContent).toBe('people'); expect(view.host.querySelector('del')?.textContent).toBe('men');
  expect(getByRole(view.host, 'link', { name: 'Go to changed passage' }).getAttribute('href')).toBe('#unit-new');
  expect(control('Previous change').hasAttribute('disabled')).toBe(true);
  await click(control('Next change')); expect(getByRole(view.host, 'link', { name: 'Go to changed passage' }).getAttribute('href')).toBe('/versions/a#unit-removed');
  await click(control('Next change')); expect(view.host.textContent).toContain('Formatting, references or structure changed.'); expect(control('Next change').hasAttribute('disabled')).toBe(true);
  await click(control('Previous change')); expect(view.host.textContent).toContain('Article 2');
  expect(getByRole(view.host, 'link', { name: 'Open full comparison' }).getAttribute('href')).toBe('/compare?from=a&to=b');
});
it('swaps direction, selects any publication and reuses cached comparisons', async () => {
  respond(); view = await mount(<ReaderComparison {...props} />); await click(control('Swap publications'));
  expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain('from=b&to=a');
  expect(getByRole(view.host, 'link', { name: 'Go to changed passage' }).getAttribute('href')).toBe('/versions/a#unit-new');
  await click(control('Swap publications')); expect(fetch).toHaveBeenCalledTimes(2);
  await choose('To','c'); expect(String(vi.mocked(fetch).mock.calls[2][0])).toContain('to=c');
  await choose('From','c'); expect(view.host.textContent).toContain('The same publication is selected'); expect(fetch).toHaveBeenCalledTimes(3);
});
it('loads only an open panel, keeps its selection and supports empty comparisons', async () => {
  respond([]); view = await mount(<ReaderComparison {...props} active={false} />); expect(fetch).not.toHaveBeenCalled();
  await view.render(<ReaderComparison {...props} active />); expect(fetch).toHaveBeenCalledOnce(); expect(view.host.textContent).toContain('No differences');
  await view.render(<ReaderComparison {...props} active={false} />); await view.render(<ReaderComparison {...props} active />); expect(fetch).toHaveBeenCalledOnce();
});
it('gives the earliest viewed publication a different default comparison and explains insufficient publications', async () => {
  respond(); view = await mount(<ReaderComparison {...props} viewedVersionId="a" />); expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('from=a&to=b');
  await view.render(<ReaderComparison {...props} publications={[publications[0]]} />); expect(view.host.textContent).toContain('At least two published versions');
});
it.each(['network','malformed','status'])('offers retry after a %s failure', async mode => {
  vi.stubGlobal('fetch', vi.fn(async () => { if(mode === 'network') throw new Error('offline'); return { ok: mode !== 'status', json: async () => ({ from: 'wrong', to: 'b', changes }) }; }));
  view = await mount(<ReaderComparison {...props} />); expect(getByRole(view.host, 'alert').textContent).toContain('could not be loaded');
  respond(); await click(control('Try again')); expect(view.host.querySelector('ins')?.textContent).toBe('people');
});
it('discards late responses after selection changes', async () => {
  let resolve!: (value: unknown) => void;
  vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValue({ ok: true, json: async () => ({ from:'a',to:'c',changes:[] }) }));
  view = await mount(<ReaderComparison {...props} />); const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
  await choose('To','c'); expect(signal?.aborted).toBe(true);
  await act(async () => resolve({ ok:true,json:async()=>({ from:'a',to:'b',changes }) }));
  expect(view.host.textContent).toContain('No differences'); expect(view.host.querySelector('ins')).toBeNull();
});
