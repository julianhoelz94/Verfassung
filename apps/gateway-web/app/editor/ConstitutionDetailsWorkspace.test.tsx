import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, getByLabelText, getByRole, queryByRole } from '@testing-library/dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConstitutionDetailsWorkspace } from './ConstitutionDetailsWorkspace';
import { EditorDraftState, useDraftState } from './EditorDraftState';
import { TranslationProvider } from '../components/TranslationProvider';
import type { ConstitutionDetails } from '../../lib/constitution-metadata';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const data: ConstitutionDetails = {
  metadata: { revisionId: 'revision-1', title: 'Grundgesetz', slug: 'grundgesetz', predecessorId: null },
  version: { id: 'version', constitutionId: 'constitution', countryCode: 'DE', versionLabel: 'Original text', effectiveDate: '1949-05-23', languageCode: 'de', publicationStatus: 'published', sourceEvidence: { description: 'Federal Law Gazette 1949, page 1.', datePrecision: 'day' } },
  versionFacts: { id: 'version', versionLabel: 'Original text', effectiveDate: '1949-05-23', languageCode: 'de', sourceUrl: 'https://example.org/source', gazetteReference: 'BGBl. 1949, p. 1', provenance: 'official', verificationState: 'verified', verifiedAt: null, verifiedBy: null, latestPublished: true },
  outline: { kinds: [{ kindCode: 'sentence', displayLabel: 'Sentence', sortOrder: 1, mayHoldText: true, mayHoldChildren: false, allowedChildKinds: [], presentation: 'concatenated', showKind: false, showLabel: false, showTitle: false, segmentation: 'sentence', sentenceDelimiters: [';'] }] },
  events: [{ id: 'event', constitutionId: 'constitution', eventType: 'commenced', eventDate: '1949-05-23', dateCertainty: 'exact', sourceUrl: null, note: null }],
};
let host: HTMLDivElement, root: Root, fetch: ReturnType<typeof vi.fn>;
const props = { constitutionId: 'constitution', versionId: 'version', code: 'DE', canEdit: true, canManageStructure: true, canPublish: true };
function DirtyText() { const { setDirty } = useDraftState(); useEffect(() => { setDirty(true); }, [setDirty]); return null; }
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  refresh.mockClear(); fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(data))); vi.stubGlobal('fetch', fetch);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function mount(extra: Partial<typeof props> = {}, dirty = false, locale: 'en' | 'de' = 'en') {
  await act(async () => root.render(<TranslationProvider locale={locale}><EditorDraftState>{dirty ? <DirtyText /> : null}<ConstitutionDetailsWorkspace {...props} {...extra} /></EditorDraftState></TranslationProvider>));
}
async function changeTitle(value: string) { await act(async () => fireEvent.change(getByLabelText(host, 'Title'), { target: { value } })); }
async function save() { await act(async () => fireEvent.submit(host.querySelector('form')!)); }

it('shows actual grouped fields and only offers appropriate existing workflows', async () => {
  await mount();
  expect(getByLabelText<HTMLInputElement>(host, 'Title').value).toBe('Grundgesetz');
  expect(host.textContent).toContain('BGBl. 1949, p. 1'); expect(host.textContent).toContain('Federal Law Gazette 1949, page 1.');
  expect(host.textContent).toContain('Flowing text · ;'); expect(host.textContent).toContain('1949-05-23');
  expect(host.querySelectorAll('input:not([type=hidden])')).toHaveLength(2);
  expect(host.querySelector('input[name=command]')?.getAttribute('value')).toBe('open-sources');
  expect(host.querySelector('input[name=versionId]')?.getAttribute('value')).toBe('version');
  expect(host.querySelector('a[href="/admin/constitutions/constitution"]')).not.toBeNull();
  expect(host.querySelector('a[href^="/editor/lifecycle/constitution"]')).not.toBeNull();
  expect(host.querySelectorAll('details[open]')).toHaveLength(1);
});
it('saves identity independently with the expected revision and updates the local saved state', async () => {
  await mount(); await changeTitle('Updated constitution');
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ...data.metadata, title: 'Updated constitution', revisionId: 'revision-2' })));
  await save();
  const options = fetch.mock.calls[1][1];
  expect(options.method).toBe('PUT'); expect(JSON.parse(options.body)).toEqual({ expectedRevisionId: 'revision-1', title: 'Updated constitution', slug: 'grundgesetz' });
  expect(host.textContent).toContain('Constitution details saved.'); expect(refresh).toHaveBeenCalledOnce();
  await changeTitle('Second correction'); fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ...data.metadata, title: 'Second correction', revisionId: 'revision-3' }))); await save();
  expect(JSON.parse(fetch.mock.calls[2][1].body).expectedRevisionId).toBe('revision-2');
});
it('retains typed identity edits after a stale-revision rejection and never retries silently', async () => {
  await mount(); await changeTitle('My correction');
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'stale_metadata' }), { status: 409 })); await save();
  expect(getByLabelText<HTMLInputElement>(host, 'Title').value).toBe('My correction');
  expect(getByRole(host, 'alert').textContent).toContain('Your edits are still here'); expect(fetch).toHaveBeenCalledTimes(2);
  const beforeUnload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(beforeUnload); expect(beforeUnload.defaultPrevented).toBe(true);
});
it('blocks identity mutation and workflow navigation while a text draft has unsaved changes', async () => {
  await mount({}, true);
  expect(getByLabelText<HTMLInputElement>(host, 'Title').disabled).toBe(true);
  expect(getByRole<HTMLButtonElement>(host, 'button', { name: 'Save constitution details' }).disabled).toBe(true);
  expect(getByRole<HTMLButtonElement>(host, 'button', { name: 'Edit source information' }).disabled).toBe(true);
  expect(host.textContent).toContain('Save the text draft');
  expect(fireEvent.click(host.querySelector('a[href="/admin/constitutions/constitution"]')!)).toBe(false);
});
it('prevents workflow navigation from silently discarding unsaved identity fields', async () => {
  await mount(); await changeTitle('Unsaved');
  expect(getByRole<HTMLButtonElement>(host, 'button', { name: 'Edit source information' }).disabled).toBe(true);
  expect(fireEvent.click(host.querySelector('a[href^="/editor/lifecycle/"]')!)).toBe(false);
});
it('keeps version facts read-only and hides unauthorized edit entry points', async () => {
  await mount({ canEdit: false, canManageStructure: false, canPublish: false }, false, 'de');
  expect(getByLabelText<HTMLInputElement>(host, 'Titel').disabled).toBe(true);
  expect(queryByRole(host, 'button', { name: /speichern/ })).toBeNull();
  expect(host.querySelector('form[action="/editor/command"]')).toBeNull();
  expect(host.querySelector('a[href^="/admin/"]')).toBeNull(); expect(host.querySelector('a[href^="/editor/lifecycle/"]')).toBeNull();
  expect(host.textContent).toContain('Textversion'); expect(host.textContent).toContain('Original text');
});
it('offers retry after an unavailable details read without erasing the editor page', async () => {
  fetch.mockResolvedValueOnce(new Response('{}', { status: 503 })); await mount();
  expect(getByRole(host, 'alert')).not.toBeNull();
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Reload saved details' })));
  expect(getByLabelText<HTMLInputElement>(host, 'Title').value).toBe('Grundgesetz');
});
it('reports a reserved slug while retaining the entered value', async () => {
  await mount(); await act(async () => fireEvent.change(getByLabelText(host, 'URL slug'), { target: { value: 'taken' } }));
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'slug_reserved' }), { status: 409 })); await save();
  expect(getByRole(host, 'alert').textContent).toContain('already reserved');
  expect(getByLabelText<HTMLInputElement>(host, 'URL slug').value).toBe('taken');
});
