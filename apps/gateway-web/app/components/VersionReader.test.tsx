import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ArticleSummary, ContentOutline } from '../../lib/api';
import { VersionReader } from './VersionReader';
import { ConstitutionText } from './ConstitutionText';
import { TranslationProvider } from './TranslationProvider';

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
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); window.history.replaceState({}, '', '/'); vi.unstubAllGlobals();
});

it('opens the exact historical note from a legacy fragment and retains an owner-neutral snapshot permalink', async () => {
  window.history.replaceState({}, '', '/#fn-note-occurrence');
  await act(async () => root.render(<VersionReader jurisdictionId="historical-region" versionId="old-snapshot" articles={articles} outline={outline} />));
  expect(host.querySelector<HTMLButtonElement>('.article-toggle')?.getAttribute('aria-expanded')).toBe('true');
  expect(host.textContent).toContain('Exact historical source note.');
  expect(host.querySelector('#fn-note-occurrence')).not.toBeNull();
  expect(host.querySelector('a[href="/versions/old-snapshot/units/root"]')).not.toBeNull();
  expect(host.querySelector('a[href^="/countries/"]')).toBeNull();
  expect(host.querySelectorAll('#root')).toHaveLength(1);
});

it('opens a pinned unit when navigation changes only the fragment', async () => {
  await act(async () => root.render(<VersionReader jurisdictionId="region" versionId="old-snapshot" articles={articles} outline={outline} />));
  await act(async () => { window.history.replaceState({}, '', '/#root'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
  expect(host.querySelector<HTMLButtonElement>('.article-toggle')?.getAttribute('aria-expanded')).toBe('true');
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

it('localizes reading controls while preserving authored outline labels and source text', async () => {
  const sourceOutline: ContentOutline = { kinds: [...outline.kinds, {
    kindCode: 'chapter', displayLabel: 'Authored chapter label', sortOrder: 2,
    mayHoldText: true, mayHoldChildren: false, allowedChildKinds: [], showTitle: true,
  }] };
  await act(async () => root.render(<TranslationProvider locale="de"><VersionReader jurisdictionId="region" versionId="old-snapshot" articles={articles} outline={sourceOutline} initialDepth="full" /></TranslationProvider>));
  expect(Array.from(host.querySelectorAll('.segmented button'), button => button.textContent)).toEqual(['Übersicht', 'Authored chapter label', 'Volltext']);
  expect(host.textContent).toContain('Exact historical source note.');
});
