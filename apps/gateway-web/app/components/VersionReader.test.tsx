import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ArticleSummary, ContentOutline } from '../../lib/api';
import { VersionReader } from './VersionReader';
import { ConstitutionText } from './ConstitutionText';
import { TranslationProvider } from './TranslationProvider';
import { fireEvent, getByRole } from '@testing-library/dom';

let host: HTMLDivElement;
let root: Root;
const outline: ContentOutline = { kinds: [
  { kindCode: 'article', displayLabel: 'Article', sortOrder: 1, mayHoldText: true, mayHoldChildren: false, allowedChildKinds: [], presentation: 'section', showLabel: true, showTitle: true, showKind: true },
] };
const articles: ArticleSummary[] = [{ id: 'root', logicalId: 'logical-root', versionId: 'old-snapshot', kind: 'article', articleNumber: '1', title: 'Rights', sortOrder: 1,
  content: [{ type: 'text', logicalId: 'note', occurrenceId: 'note-occurrence', format: 'footnote', text: 'Exact historical source note.' }] }];
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { callback(); return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('scrollBy', vi.fn()); localStorage.clear();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); window.history.replaceState({}, '', '/'); vi.unstubAllGlobals();
});

it('opens the exact historical note from a legacy fragment and retains an owner-neutral snapshot permalink', async () => {
  window.history.replaceState({}, '', '/#fn-note-occurrence');
  await act(async () => root.render(<VersionReader jurisdictionId="historical-region" versionId="old-snapshot" articles={articles} outline={outline} />));
  expect(host.querySelector('#unit-root')).not.toBeNull();
  expect(host.textContent).toContain('Exact historical source note.');
  expect(host.querySelector('#fn-note-occurrence')).not.toBeNull();
  expect(host.querySelector('a[href="/versions/old-snapshot/units/root"]')).not.toBeNull();
  expect(host.querySelector('a[href^="/countries/"]')).toBeNull();
  expect(host.querySelectorAll('#root')).toHaveLength(1);
});

it('opens a pinned unit when navigation changes only the fragment', async () => {
  await act(async () => root.render(<VersionReader jurisdictionId="region" versionId="old-snapshot" articles={articles} outline={outline} />));
  await act(async () => { window.history.replaceState({}, '', '/#root'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
  expect(host.querySelector('#unit-root')).not.toBeNull();
  expect(host.textContent).toContain('Exact historical source note.');
});

it('keeps the regional reader text in the server response when JavaScript is disabled', () => {
  const html = renderToStaticMarkup(<VersionReader jurisdictionId="region" versionId="old-snapshot" articles={articles} outline={outline} initialDepth="full" />);
  expect(html).toContain('Exact historical source note.');
  expect(html).toContain('href="/versions/old-snapshot/units/root"');
  host.innerHTML = html;
  expect(host.querySelectorAll('#root')).toHaveLength(1);
});

it('keeps an occurrence anchor on a standalone unit', () => {
  host.innerHTML = renderToStaticMarkup(<ConstitutionText article={articles[0]} outline={outline} />);
  expect(host.querySelectorAll('#root')).toHaveLength(1);
});

it('uses the same article heading and endnote row structure in the viewer and preview renderer', () => {
  host.innerHTML = renderToStaticMarkup(<VersionReader jurisdictionId="region" versionId="old-snapshot" articles={articles} outline={outline} initialDepth="full" />);
  const viewerHeading = host.querySelector('#unit-root')!.innerHTML;
  const noteClass = host.querySelector('.legal-footnote')!.className;
  const preview = document.createElement('div');
  preview.innerHTML = renderToStaticMarkup(<ConstitutionText article={articles[0]} outline={outline} headingLevel="h2" />);
  expect(preview.querySelector('h2')!.innerHTML).toBe(viewerHeading);
  expect(preview.querySelector('.legal-footnote')!.className).toBe(noteClass);
  expect(viewerHeading).toContain('articleTitle');
  expect(host.querySelector('section > h2')?.textContent).toBe('Footnotes');
});

it('reveals a collapsed early article when an endnote backlink targets its marker', async () => {
  const source: ArticleSummary[] = [
    { ...articles[0], id: 'early', content: [{ type: 'text', logicalId: 'text', occurrenceId: 'text-occ', text: 'Original body.', references: [{ logicalId: 'marker', start: 14, end: 14, target: { type: 'footnote', footnoteId: 'note' } }] }] },
    { ...articles[0], id: 'last', articleNumber: '20' },
  ];
  await act(async () => root.render(<VersionReader jurisdictionId="region" versionId="old-snapshot" articles={source} outline={outline} initialDepth="summary" />));
  expect(host.querySelector('#fn-note-occurrence')).not.toBeNull();
  expect(host.querySelector('#ref-marker')).toBeNull();
  await act(async () => { window.history.replaceState({}, '', '/#ref-marker'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
  expect(host.querySelector('#ref-marker')).not.toBeNull();
  expect(host.querySelector('#unit-early button')?.getAttribute('aria-expanded')).toBe('true');
  expect(host.querySelectorAll('#fn-note-occurrence')).toHaveLength(1);
});

it('localizes reading controls while preserving authored outline labels and source text', async () => {
  const sourceOutline: ContentOutline = { kinds: [...outline.kinds, {
    kindCode: 'chapter', displayLabel: 'Authored chapter label', sortOrder: 2,
    mayHoldText: true, mayHoldChildren: false, allowedChildKinds: [], showTitle: true,
  }] };
  await act(async () => root.render(<TranslationProvider locale="de"><VersionReader jurisdictionId="region" versionId="old-snapshot" articles={articles} outline={sourceOutline} initialDepth="full" /></TranslationProvider>));
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Leseeinstellungen' })));
  expect(Array.from(host.querySelectorAll('select[aria-label="Detailgrad"] option'), option => option.textContent)).toEqual(['Übersicht', 'Authored chapter label', 'Volltext']);
  expect(host.textContent).toContain('Exact historical source note.');
});
