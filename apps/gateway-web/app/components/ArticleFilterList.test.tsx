import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent } from '@testing-library/dom';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { ContentOutline } from '../../lib/api';
import { ArticleFilterList } from './ArticleFilterList';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it('keeps article labels and filtering available without custom outline settings', async () => {
  await act(async () => root.render(<ArticleFilterList articles={[{ id: 'article', articleNumber: '1', title: 'Rights' }]} hrefBase="/editor?sessionId=test" draftIds={[]} />));
  expect(host.querySelector('a')?.textContent).toBe('Article 1 Rights');
  expect(host.querySelector('input')?.getAttribute('aria-label')).toBe('Filter articles');
});

it('labels and filters mixed roots by each configured kind while retaining the selected draft link', async () => {
  const outline: ContentOutline = { kinds: ['Preamble', 'Article', 'Appendix'].map((name, index) => ({
    kindCode: name.toLowerCase(), displayLabel: name, sortOrder: index, root: true,
    mayHoldText: true, mayHoldChildren: false, allowedChildKinds: [], presentation: 'section', showLabel: true, showTitle: true, showKind: true,
  })) };
  const articles = [
    { id: 'preamble', kind: 'preamble', articleNumber: '', title: 'Purpose' },
    { id: 'article', kind: 'article', articleNumber: '1', title: 'Civic rights' },
    { id: 'appendix', kind: 'appendix', articleNumber: 'A', title: 'Sources' },
  ];
  await act(async () => root.render(<ArticleFilterList articles={articles} outline={outline} hrefBase="/editor?sessionId=test" draftIds={['article']} selectedId="article" />));
  const labels = () => [...host.querySelectorAll('a > span:first-child')].map(label => label.textContent);
  expect(labels()).toEqual(['Preamble Purpose', 'Article 1 Civic rights', 'Appendix A Sources']);
  expect(host.querySelector('a[aria-current="true"]')?.getAttribute('href')).toBe('/editor?sessionId=test&articleId=article');
  expect(host.querySelector('a[aria-current="true"] .badge')?.textContent).toBe('draft');
  const filter = host.querySelector('input')!;
  expect(filter.getAttribute('aria-label')).toBe('Filter units');
  await act(async () => { fireEvent.change(filter, { target: { value: 'appendix' } }); });
  expect(labels()).toEqual(['Appendix A Sources']);
  await act(async () => { fireEvent.change(filter, { target: { value: 'article' } }); });
  expect(labels()).toEqual(['Article 1 Civic rights']);
});
