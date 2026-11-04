import { expect, it } from 'vitest';
import { originalEntriesText } from './reader-actions';
import { findReaderText } from './reader-search';
import type { OrderedEntry } from './api';

function child(text: string): OrderedEntry {
  return { type: 'child', node: { occurrenceId: 'n', logicalId: 'l', revisionId: 'r', kind: 'paragraph', content: [{ type: 'text', text }] } };
}

it('keeps structural headings and authored breaks in copied original text', () => {
  expect(originalEntriesText([{ type: 'text', text: 'A' }, child(''), { type: 'text', text: 'B' }])).toBe('A\n\nparagraph B');
  expect(originalEntriesText([child('A'), { type: 'text', text: 'B', lineBreaksBefore: 2 }, child('C')])).toBe('paragraph\nA\n\nB\n\nparagraph\nC');
});

it('preserves empty table cells, exact captions and explicit footnote labels', () => {
  expect(originalEntriesText([{ type: 'text', format: 'table', table: { caption: 'Title', rows: [{ cells: [{ text: '' }, { text: 'B' }] }] } }, { type: 'text', format: 'footnote', footnoteLabel: '', text: ' Note ' }])).toBe('Title\n\tB  Note ');
});

it('orders zero-width source note labels without replacing spans or invalid positions', () => {
  const labels = new Map([['note', '†']]);
  const target = { type: 'footnote' as const, footnoteId: 'note' };
  const refs = [{ logicalId: 'late', start: 3, end: 3, target }, { logicalId: 'first', start: 0, end: 0, target }, { logicalId: 'span', start: 1, end: 2, target }, { logicalId: 'invalid', start: 9, end: 9, target }];
  expect(originalEntriesText([{ type: 'text', text: 'A😀', references: refs }], undefined, labels)).toBe('†A😀†');
});

it('keeps whitespace-only values and existing source whitespace at structural boundaries', () => {
  expect(originalEntriesText([{ type: 'text', text: 'A ' }, child(' B'), { type: 'text', text: ' C' }])).toBe('A paragraph\n B C');
});

it('includes footnote text nested in controls while rejecting other control and chrome text', () => {
  const host = document.createElement('div');
  host.innerHTML = '<p><button>Skip <span data-footnote-text>Find</span></button><span data-reader-chrome>Find</span><script>Find</script></p><p>Find</p>';
  const matches = findReaderText(host, 'find');
  expect(matches.map(match => match.range.toString())).toEqual(['Find', 'Find']);
  expect(matches.map(match => match.element.tagName)).toEqual(['P', 'P']);
});

it('preserves UTF-16 range endpoints across adjacent inline nodes and literal punctuation', () => {
  const host = document.createElement('div');
  host.innerHTML = '<p>😀<strong>A[</strong><i>b]</i><a>😀</a></p>';
  const [match] = findReaderText(host, 'A[b]😀');
  expect(match.range.toString()).toBe('A[b]😀');
  expect(match.range.startContainer).toBe(host.querySelector('strong')!.firstChild);
  expect(match.range.startOffset).toBe(0);
  expect(match.range.endContainer).toBe(host.querySelector('a')!.firstChild);
  expect(match.range.endOffset).toBe(2);
});
