import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, getByLabelText, getByRole, queryByRole } from '@testing-library/dom';
import { VersionReader, type VersionReaderProps } from './VersionReader';
import { TranslationProvider } from './TranslationProvider';
import { saveReaderPreferences } from '../../lib/reader-preferences';
import { defaultReaderPreferences } from '../../lib/reader';
import { continuousReaderOutline, continuousReaderUnits } from '../../e2e/fixtures/continuous-reader.mjs';

let host: HTMLDivElement, root: Root;
const recent = '01900000-0000-4000-8000-000000000004';
const previous = '01900000-0000-4000-8000-000000000003';
const props: VersionReaderProps = { code: 'DE', versionId: recent, language: 'en', articles: continuousReaderUnits(recent), outline: continuousReaderOutline,
  context: { constitutionId: 'constitution', title: 'Constitution', jurisdictionName: 'Linden', versionLabel: 'Revised publication', publications: [
    { id: previous, snapshotId: previous, versionLabel: 'Original', effectiveDate: '1949-01-01' }, { id: recent, snapshotId: recent, versionLabel: 'Revised', effectiveDate: '2022-01-01' },
  ], overviewHref: '/constitution', comparisonHref: '/compare', wikiState: 'published', editWikiHref: '/editor/wiki/constitution/constitution' },
  wiki: <p>A published historical introduction.</p>, details: <><h2>Details</h2><p>Pinned archival source.</p></>,
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); saveReaderPreferences(defaultReaderPreferences); localStorage.clear();
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => { fn(); return 1; }); vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} }); vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('scrollBy', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { const query = new URL(url, 'http://localhost').searchParams; return { ok: true, json: async () => ({ from: query.get('from'), to: query.get('to'), changes: [] }) }; }));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); window.history.replaceState({}, '', '/'); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render(patch: Partial<VersionReaderProps> = {}, locale: 'en' | 'de' = 'en') { await act(async () => root.render(<TranslationProvider locale={locale}><VersionReader {...props} {...patch} /></TranslationProvider>)); }
async function click(name: string) { await act(async () => fireEvent.click(getByRole(host, 'button', { name, exact: true }))); }

it('renders a complete, version-pinned document in the server response, including global endnotes and exact line breaks', () => {
  const html = renderToStaticMarkup(<VersionReader {...props} />); host.innerHTML = html;
  expect(host.querySelectorAll('h1')).toHaveLength(1); expect(host.querySelectorAll('[id^="unit-"]')).toHaveLength(20);
  expect(host.querySelectorAll('[role="note"]')).toHaveLength(1);
  expect(host.querySelector('table')?.textContent).toContain('Institutions');
  expect(host.querySelector('a[href="https://example.org/public-record"]')?.textContent).toBe('public record');
  expect(host.textContent).toContain('The legislature meets in public.\nThe executive remains accountable.');
  expect(host.querySelectorAll('[aria-label="Show footnote *"]')).toHaveLength(2);
});
it('hides contents as a saved view preference while retaining every legal text identity', async () => {
  await render(); const ids = [...host.querySelectorAll('[id]')].map(node => node.id);
  await click('Hide table of contents'); expect(getByRole(host, 'button', { name: 'Show table of contents' }).getAttribute('aria-expanded')).toBe('false');
  expect(JSON.parse(localStorage.getItem('ca_reader_preferences_v1')!).navigation).toBe(false);
  expect([...host.querySelectorAll('[id]')].map(node => node.id)).toEqual(ids);
  await click('Show table of contents'); expect(host.querySelector('#reader-contents')?.hasAttribute('hidden')).toBe(false);
});
it('uses an in-memory preference when storage is unavailable', async () => {
  await render(); vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  await click('Hide table of contents'); expect(getByRole(host, 'button', { name: 'Show table of contents' })).toBeTruthy();
});
it('keeps Wiki and comparison mutually exclusive and preserves a comparison when it is reopened', async () => {
  await render(); expect(fetch).not.toHaveBeenCalled();
  await click('Wiki'); expect(getByRole(host, 'region', { name: 'Wiki' }).textContent).toContain('A published historical introduction.');
  await click('Compare'); expect(queryByRole(host, 'region', { name: 'Wiki' })).toBeNull();
  expect(fetch).toHaveBeenCalledOnce(); await click('Wiki'); await click('Compare'); expect(fetch).toHaveBeenCalledOnce();
  expect(getByRole(host, 'link', { name: 'Open full comparison' }).getAttribute('href')).toContain('from=');
});
it('distinguishes an unpublished introduction from a temporarily unavailable one and retains the editing entry', async () => {
  await render({ wiki: undefined, context: { ...props.context!, wikiState: 'empty' } }); await click('Wiki');
  expect(host.textContent).toContain('An introduction has not been published'); expect(getByRole(host, 'link', { name: 'Edit constitution page' })).toBeTruthy();
  await render({ wiki: undefined, context: { ...props.context!, wikiState: 'unavailable', editWikiHref: undefined } });
  expect(host.textContent).toContain('The introduction is temporarily unavailable.'); expect(queryByRole(host, 'link', { name: 'Edit constitution page' })).toBeNull();
  await click('Close Wiki'); expect(getByRole(host, 'button', { name: 'Wiki', exact: true })).toBe(document.activeElement);
});
it('opens and dismisses Details by Escape and outside click without replacing source content', async () => {
  await render(); await click('Details'); expect(getByRole(host, 'heading', { name: 'Details' })).toBeTruthy();
  await act(async () => fireEvent.keyDown(document, { key: 'Escape' })); expect(getByRole(host, 'button', { name: 'Details', exact: true }).getAttribute('aria-expanded')).toBe('false');
  await click('Details'); await act(async () => fireEvent.pointerDown(host.querySelector('h1')!));
  expect(getByRole(host, 'button', { name: 'Details', exact: true }).getAttribute('aria-expanded')).toBe('false');
  expect(host.textContent).toContain('Every person has equal rights.');
});
it('changes text size and sentence presentation without changing legal wording, marks, links or occurrence IDs', async () => {
  await render(); const wording = () => [...host.querySelectorAll('.constitution-body [id]')].filter(node => !node.querySelector('[id]')).map(node => [node.id, node.textContent]);
  const text = wording(); const first = host.querySelector('strong')?.textContent;
  await click('Reading preferences');
  await act(async () => fireEvent.change(getByLabelText(host, 'Text size'), { target: { value: '20' } }));
  expect(host.firstElementChild?.getAttribute('style')).toContain('20px');
  await act(async () => fireEvent.change(getByLabelText(host, 'Sentence presentation'), { target: { value: 'lines' } }));
  expect(queryByRole(host, 'checkbox', { name: 'Show sentence boundaries' })).toBeNull();
  expect(wording()).toEqual(text); expect(host.querySelector('strong')?.textContent).toBe(first);
  await act(async () => fireEvent.change(getByLabelText(host, 'Sentence presentation'), { target: { value: 'flowing' } }));
  await act(async () => fireEvent.click(getByRole(host, 'checkbox', { name: 'Show sentence boundaries' })));
  expect(host.querySelector('[data-boundaries="true"]')).not.toBeNull();
});
it('does not expose sentence presentation for a hierarchy without configured sentence leaves', async () => {
  await render({ outline: { kinds: [continuousReaderOutline.kinds[0]] } }); await click('Reading preferences');
  expect(queryByRole(host, 'combobox', { name: 'Sentence presentation' })).toBeNull();
});
it('finds source phrases across formatting and clears them without corrupting references or authored text', async () => {
  await render(); const body = host.querySelector('[lang]')!.textContent;
  await click('Find in text'); await act(async () => fireEvent.change(getByRole(host, 'searchbox'), { target: { value: 'Every person' } }));
  expect(getByRole(host, 'status').textContent).toContain('1 of 1 matches');
  await act(async () => fireEvent.change(getByRole(host, 'searchbox'), { target: { value: '[missing]' } }));
  expect(getByRole(host, 'status').textContent).toBe('No matches'); await click('Close search');
  expect(host.querySelector('[lang]')!.textContent).toBe(body); expect(host.querySelectorAll('[aria-label="Show footnote *"]')).toHaveLength(2);
});
it('reveals the existing edit workflow only when its permission-checked content is supplied', async () => {
  await render(); expect(queryByRole(host, 'button', { name: 'Edit this constitution' })).toBeNull();
  await render({ editorial: <form><button>Correct this text</button></form> }); await click('Edit this constitution');
  expect(getByRole(host, 'button', { name: 'Correct this text' })).toBeTruthy();
});
it('localizes controls while retaining source labels and text', async () => {
  await render({}, 'de'); expect(getByRole(host, 'button', { name: 'Im Text suchen' })).toBeTruthy();
  await click('Leseeinstellungen'); expect(getByLabelText(host, 'Satzdarstellung')).toBeTruthy();
  expect(host.textContent).toContain('Every person has equal rights.');
});
