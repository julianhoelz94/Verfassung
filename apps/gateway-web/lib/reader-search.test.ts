import { afterEach, expect, it, vi } from 'vitest';
import { clearReaderHighlights, findReaderText, highlightReaderMatches } from './reader-search';

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });
it('finds phrases across emphasis and reference links without changing any source node or anchor', () => {
  const host = document.createElement('div'); host.innerHTML = '<p id="original">Equal <strong>public</strong> <a href="#target">rights</a>. <button>public rights</button></p><p>PUBLIC RIGHTS.</p>';
  document.body.append(host); const before = host.innerHTML, link = host.querySelector('a');
  const matches = findReaderText(host, 'public rights');
  expect(matches).toHaveLength(2); expect(matches.map(match => match.range.toString())).toEqual(['public rights', 'PUBLIC RIGHTS']);
  expect(host.innerHTML).toBe(before); expect(host.querySelector('a')).toBe(link);
});
it('treats search punctuation literally, preserves Unicode offsets, and does not match across paragraphs', () => {
  const host = document.createElement('div'); host.innerHTML = '<p>İ Rights [a+b]? Rights.</p><p>Second</p><p>paragraph</p>';
  expect(findReaderText(host, '[a+b]?')[0].range.toString()).toBe('[a+b]?');
  expect(findReaderText(host, 'Rights').map(match => match.range.toString())).toEqual(['Rights', 'Rights']);
  expect(findReaderText(host, 'Secondparagraph')).toEqual([]); expect(findReaderText(host, '  ')).toEqual([]);
});
it('skips reader chrome and note buttons but includes source text and tables', () => {
  const host = document.createElement('div'); host.innerHTML = '<h1 data-reader-chrome>Source</h1><p>Source<a role="button">Source</a></p><table><tbody><tr><td>Source</td></tr></tbody></table>';
  expect(findReaderText(host, 'source')).toHaveLength(2);
});
it('uses native highlight ranges when available and remains usable without that browser API', () => {
  const host = document.createElement('div'); host.innerHTML = '<p>Rights.</p>'; const matches = findReaderText(host, 'Rights');
  expect(() => highlightReaderMatches(matches, 0)).not.toThrow(); expect(() => clearReaderHighlights()).not.toThrow();
  const set = vi.fn(), remove = vi.fn();
  vi.stubGlobal('CSS', { highlights: { set, delete: remove } });
  vi.stubGlobal('Highlight', class { constructor(...ranges: Range[]) { Object.assign(this, { ranges }); } });
  highlightReaderMatches(matches, 0); expect(set).toHaveBeenCalledTimes(2);
  highlightReaderMatches([], 5); expect(set).toHaveBeenCalledTimes(4);
  clearReaderHighlights(); expect(remove.mock.calls).toEqual([['reader-find'], ['reader-current']]);
});
