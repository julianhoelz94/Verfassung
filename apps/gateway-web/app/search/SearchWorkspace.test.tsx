import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, getByRole, getByLabelText, queryByRole } from '@testing-library/dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SearchWorkspace } from './SearchWorkspace';
import { TranslationProvider } from '../components/TranslationProvider';
import { SearchReturnLink } from '../components/SearchReturnLink';
import { emptySearchCriteria, searchHitKey, type SearchPassage, type SearchWorkspaceData } from '../../lib/search-workspace';
import { rememberSearch, takeSearchPosition } from './search-memory';
import { searchUrl } from '../../lib/search-url';

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav, useSearchParams: () => nav.params }));
const first = { articleId: 'article', versionId: 'original', countryCode: 'XA', constitutionTitle: 'Charter', versionLabel: 'Original', effectiveDate: null, articleNumber: '1', title: 'Rights', snippet: '<mark>Authored</mark> text.', rank: 1 };
const second = { ...first, articleId: 'regional-article', countryCode: '', jurisdictionId: 'historical', jurisdictionName: 'Historical region', historical: true };
const data: SearchWorkspaceData = { query: 'Authored', requestHref: '/search?q=Authored', criteria: emptySearchCriteria, hits: [first, second], total: 22, offset: 0, limit: 20,
  facets: { countries: [{ code: 'XA', countryName: 'Republic', count: 22 }], jurisdictions: [{ id: 'historical', name: 'Historical region', historical: true, countryCode: '', count: 1 }],
    versions: [{ id: 'original', label: 'Original', constitutionTitle: 'Charter', countryCode: 'XA', jurisdictionId: 'national', count: 21 }], dates: [{ effectiveDate: '1949-05-23', count: 21 }] },
  unavailable: false, facetsUnavailable: false, adjusted: false };
const passage: SearchPassage = { article: { id: 'article', versionId: 'original', articleNumber: '1', title: 'Rights', body: 'Exact Authored text.', sortOrder: 0,
  content: [{ type: 'text', logicalId: 'prose', text: 'Exact Authored text.', marks: [{ type: 'italic', start: 6, end: 14 }] }] },
  outline: null, language: 'de', versionId: 'original', versionLabel: 'Original', readerHref: '/countries/XA/versions/original#article', notes: [] };
let host: HTMLDivElement, root: Root;
const fetcher = vi.fn();
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks(); sessionStorage.clear(); nav.params = new URLSearchParams();
  vi.stubGlobal('fetch', fetcher); fetcher.mockResolvedValue({ ok: true, json: async () => passage });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function render(patch: Partial<SearchWorkspaceData> = {}, locale: 'en' | 'de' = 'en') {
  const value = { ...data, ...patch };
  if (!patch.requestHref) value.requestHref = searchUrl({ q: value.query, ...value.criteria, offset: value.offset });
  await act(async () => root.render(<TranslationProvider locale={locale}><SearchWorkspace data={value} /></TranslationProvider>));
}
async function click(element: Element) { await act(async () => { fireEvent.click(element); }); }
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); }); }

it('submits only the chosen query, applies filters immediately, resets offset and retains a newer unsent draft', async () => {
  await render({ offset: 20 });
  const input = getByRole(host, 'searchbox', { name: 'Search words or a passage' });
  await act(async () => fireEvent.change(input, { target: { value: ' new words ' } }));
  await click(getByRole(host, 'button', { name: 'Search', exact: true }));
  expect(nav.push).toHaveBeenLastCalledWith('/search?q=new+words', { scroll: false });
  await act(async () => fireEvent.change(input, { target: { value: 'Still typing' } }));
  await render({ query: 'new words' });
  expect((input as HTMLInputElement).value).toBe('Still typing');
  await click(getByRole(host, 'button', { name: 'Filters', exact: true }));
  await act(async () => fireEvent.change(getByLabelText(host, 'Country'), { target: { value: 'XA' } }));
  expect(nav.replace).toHaveBeenLastCalledWith('/search?q=new+words&country=XA', { scroll: false });
  await act(async () => fireEvent.change(getByLabelText(host, 'Version'), { target: { value: 'original' } }));
  await act(async () => fireEvent.change(getByLabelText(host, 'Effective date'), { target: { value: '1949-05-23' } }));
  expect(nav.replace).toHaveBeenLastCalledWith('/search?q=new+words&country=XA&versionId=original&effectiveDate=1949-05-23', { scroll: false });
  await click(getByRole(host, 'button', { name: 'Done' }));
  expect(host.querySelector<HTMLButtonElement>('button[aria-controls="search-filters"]')!.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(host.querySelector<HTMLButtonElement>('button[aria-controls="search-filters"]')!);
  await click(getByRole(host, 'button', { name: 'Clear search field' }));
  expect((input as HTMLInputElement).value).toBe(''); expect(document.activeElement).toBe(input);
});

it('keeps safe removable unknown pins visible and clears incompatible scope with usable keyboard controls', async () => {
  await render({ criteria: { country: 'XA', jurisdictionId: '', versionId: 'original', effectiveDate: '' } });
  await click(host.querySelector<HTMLButtonElement>('button[aria-controls="search-filters"]')!);
  await act(async () => fireEvent.change(getByLabelText(host, 'Jurisdiction'), { target: { value: 'historical' } }));
  expect(nav.replace).toHaveBeenLastCalledWith('/search?jurisdictionId=historical&q=Authored', { scroll: false });
  await act(async () => fireEvent.keyDown(host.querySelector('#search-filters')!, { key: 'Escape' }));
  expect(document.activeElement).toBe(host.querySelector<HTMLButtonElement>('button[aria-controls="search-filters"]')!);
  await act(async () => window.dispatchEvent(new PopStateEvent('popstate')));
  await render({ facets: { countries: [], versions: [], dates: [] }, criteria: { ...emptySearchCriteria, versionId: 'unknown', effectiveDate: '1900-01-01' }, facetsUnavailable: true });
  expect(host.textContent).toContain('Selected snapshot (not listed in the search index)'); expect(host.querySelector('option[value="1900-01-01"]')).not.toBeNull();
  await click(getByRole(host, 'link', { name: 'Remove filter: Selected snapshot (not listed in the search index)' }));
  expect(nav.push).toHaveBeenLastCalledWith('/search?q=Authored&effectiveDate=1900-01-01', { scroll: false });
  await click(getByRole(host, 'link', { name: 'Clear filters', exact: true }));
  expect(nav.push).toHaveBeenLastCalledWith('/search?q=Authored', { scroll: false });
});

it('does not let an earlier filter response clear a newer selection', async () => {
  await render();
  await click(host.querySelector('button[aria-controls="search-filters"]')!);
  await act(async () => fireEvent.change(getByLabelText(host, 'Country'), { target: { value: 'XA' } }));
  await act(async () => fireEvent.change(getByLabelText(host, 'Version'), { target: { value: 'original' } }));
  await render({ criteria: { ...emptySearchCriteria, country: 'XA' } });
  expect((getByLabelText(host, 'Version') as HTMLSelectElement).value).toBe('original');
  await act(async () => fireEvent.change(getByLabelText(host, 'Effective date'), { target: { value: '1949-05-23' } }));
  expect(nav.replace).toHaveBeenLastCalledWith('/search?q=Authored&country=XA&versionId=original&effectiveDate=1949-05-23', { scroll: false });
});

it('opens the real authored renderer with emphasis, exact snapshot and language; Escape restores focus and reopening uses the cache', async () => {
  await render();
  const origin = host.querySelector<HTMLButtonElement>('button[id^="search-preview-trigger-"]')!;
  // There are two independent results, so select the first directly.
  await click(origin);
  await settle();
  expect(fetcher).toHaveBeenCalledWith('/api/reader/search-preview?versionId=original&articleId=article', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  const dialog = getByRole(host, 'dialog', { name: 'Charter' });
  expect(dialog.querySelector('[data-constitution-document]')).not.toBeNull();
  expect(dialog.querySelector('em')?.textContent).toBe('Authored'); expect(dialog.querySelector('[lang="de"]')).not.toBeNull();
  const link = getByRole(dialog, 'link', { name: 'Open in constitution' }) as HTMLAnchorElement;
  expect(link.hash).toBe('#article'); expect(new URL(link.href).searchParams.get('fromSearch')).toBe('/search?q=Authored');
  await act(async () => fireEvent.keyDown(dialog, { key: 'Escape' })); await settle();
  expect(queryByRole(host, 'dialog')).toBeNull(); expect(document.activeElement).toBe(origin);
  await click(origin); expect(fetcher).toHaveBeenCalledTimes(1);
  await click(getByRole(host, 'button', { name: 'Hide preview' })); await settle();
  await click(getByRole(host, 'button', { name: 'Show preview' }));
  expect(queryByRole(host, 'dialog')).not.toBeNull();
});

it('reports an unavailable or mismatched preview honestly and supports retry without changing the search', async () => {
  fetcher.mockResolvedValueOnce({ ok: false });
  await render();
  await click(host.querySelectorAll('button[aria-controls="search-preview"]')[1]); await settle();
  expect(getByRole(host, 'alert').textContent).toContain('could not be loaded');
  fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ ...passage, versionId: 'successor' }) });
  await click(getByRole(host, 'button', { name: 'Try again' })); await settle();
  expect(getByRole(host, 'alert').textContent).toContain('could not be loaded');
  await click(getByRole(host, 'button', { name: 'Try again' })); await settle();
  expect(queryByRole(host, 'alert')).toBeNull(); expect(host.textContent).toContain('Exact Authored text.');
  expect(nav.push).not.toHaveBeenCalled(); expect(nav.replace).not.toHaveBeenCalled();
});

it('shows canonical inline footnotes without closing the passage on Escape and retains the Search return in note navigation', async () => {
  fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ ...passage,
    article: { ...passage.article, content: [{ type: 'text', logicalId: 'text', text: 'Authored text.', references: [{ logicalId: 'citation', start: 0, end: 8, target: { type: 'footnote', footnoteId: 'note' } }] }] },
    notes: [{ logicalId: 'note', label: 'a', text: 'Exact authored source note.', href: '/countries/XA/versions/original#fn-note' }],
  }) });
  await render();
  await click(host.querySelector('button[id^="search-preview-trigger-"]')!); await settle();
  const marker = getByRole(host, 'button', { name: 'Show footnote a' });
  await click(marker);
  expect(getByRole(document.body, 'dialog', { name: 'Footnote a' }).textContent).toContain('Exact authored source note.');
  await act(async () => fireEvent.keyDown(document, { key: 'Escape' }));
  expect(queryByRole(document.body, 'dialog', { name: 'Footnote a' })).toBeNull();
  expect(queryByRole(host, 'dialog', { name: 'Charter' })).not.toBeNull(); expect(document.activeElement).toBe(marker);
  await click(marker);
  const jump = getByRole(document.body, 'link', { name: 'Go to footnote' }) as HTMLAnchorElement;
  expect(new URL(jump.href).searchParams.get('fromSearch')).toBe('/search?q=Authored');
  jump.addEventListener('click', event => event.preventDefault(), { once: true });
  await click(jump);
  expect(takeSearchPosition('/search?q=Authored')).toMatchObject({ preview: searchHitKey(first), focusId: 'search-result-' + searchHitKey(first) });
});

it('cancels stale preview requests when another passage is selected or the preview is closed', async () => {
  let resolveFirst: (value: unknown) => void = () => {};
  fetcher.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
  await render(); const triggers = host.querySelectorAll('button[id^="search-preview-trigger-"]');
  await click(triggers[0]); const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
  await click(triggers[1]); await settle();
  expect(signal.aborted).toBe(true);
  await act(async () => resolveFirst({ ok: true, json: async () => passage }));
  expect(host.querySelector('#search-preview')?.textContent).not.toContain('Exact Authored text.');
  await click(getByRole(host, 'button', { name: 'Close preview' }));
});

it('offers honest start, empty and outage states in both languages with usable next actions', async () => {
  await render({ query: '', hits: [], total: 0 }, 'de');
  await click(host.querySelectorAll('main a')[1]);
  expect(nav.push.mock.calls.at(-1)?.[0]).toContain('q=');
  await act(async () => window.dispatchEvent(new PopStateEvent('popstate')));
  await render({ hits: [], total: 0, criteria: { ...emptySearchCriteria, country: 'XA' } });
  expect(host.textContent).toContain('No matching passages');
  await click(getByRole(host, 'button', { name: 'Change search words' })); expect(document.activeElement?.id).toBe('search-q');
  await click(getByRole(host, 'link', { name: 'Remove all filters' }));
  await render({ unavailable: true, hits: [], total: 0 });
  expect(getByRole(host, 'alert').textContent).toContain('unavailable');
  expect(getByRole(host, 'link', { name: 'Try again' }).getAttribute('href')).toBe('/search?q=Authored');
  expect(host.querySelector('.pager')).toBeNull();
});

it('retains result context when opening the real reader and restores its exact position on return', async () => {
  await render();
  const anchor = host.querySelector<HTMLAnchorElement>('.search-hits h2 a')!;
  anchor.addEventListener('click', event => event.preventDefault(), { once: true });
  await act(async () => { fireEvent.click(anchor); });
  expect(takeSearchPosition('/search?q=Authored')).toMatchObject({ focusId: anchor.id, draft: 'Authored' });
  rememberSearch('/search?q=Authored&offset=20', { scroll: 480, focusId: anchor.id, draft: 'Retained draft', filtersOpen: true, preview: searchHitKey(first) });
  await render({ offset: 20 }); await settle();
  expect((host.querySelector('#search-q') as HTMLInputElement).value).toBe('Retained draft');
  expect(host.querySelector('details')?.open).toBe(true); expect(queryByRole(host, 'dialog')).not.toBeNull();
  expect(window.scrollTo).toHaveBeenCalledWith(0, 480);
  expect(document.activeElement?.id).toBe(anchor.id);
});

it('offers a localized Search return in the real reader and rejects an external return', async () => {
  nav.params = new URLSearchParams({ fromSearch: '/search?q=rights&offset=20' });
  await act(async () => root.render(<TranslationProvider locale="de"><SearchReturnLink /></TranslationProvider>));
  expect(getByRole(host, 'link', { name: 'Zurück zu den Suchergebnissen' }).getAttribute('href')).toBe('/search?q=rights&offset=20');
  nav.params = new URLSearchParams({ fromSearch: 'https://evil.test/' });
  await act(async () => root.render(<SearchReturnLink />)); expect(host.textContent).toBe('');
});
