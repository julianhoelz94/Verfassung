import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, getByRole, queryByRole } from '@testing-library/dom';
import { FootnoteMarker, FootnoteProvider } from './Footnotes';
import { OrderedContentTree } from './ConstitutionText';
import { TranslationProvider } from './TranslationProvider';
import { footnoteItems } from '../../lib/footnotes';
import { findReaderText } from '../../lib/reader-search';
import type { OrderedEntry } from '../../lib/api';

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); window.history.replaceState({}, '', '/'); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const note = { logicalId: 'note', label: '*', text: 'The source note.', href: '#fn-note' };

it('opens a drawer without scrolling, dismisses outside and with X/Escape, and only jumps on its link', async () => {
  const scroll = vi.fn();
  await act(async () => root.render(<FootnoteProvider notes={[note]}><p>Body <FootnoteMarker noteId="note" /></p><aside id="fn-note">The source note.</aside></FootnoteProvider>));
  host.querySelector<HTMLElement>('#fn-note')!.scrollIntoView = scroll;
  const marker = getByRole(host, 'button', { name: 'Show footnote *' });
  await act(async () => fireEvent.click(marker));
  expect(getByRole(document.body, 'dialog', { name: 'Footnote *' }).textContent).toContain(note.text);
  expect(scroll).not.toHaveBeenCalled();
  await act(async () => fireEvent.pointerDown(host.querySelector('p')!));
  expect(queryByRole(document.body, 'dialog')).toBeNull();
  await act(async () => fireEvent.click(marker));
  await act(async () => fireEvent.click(getByRole(document.body, 'button', { name: 'Close footnote' })));
  expect(queryByRole(document.body, 'dialog')).toBeNull();
  await act(async () => fireEvent.click(marker));
  await act(async () => fireEvent.keyDown(document, { key: 'Escape' }));
  expect(queryByRole(document.body, 'dialog')).toBeNull();
  await act(async () => fireEvent.click(marker));
  await act(async () => fireEvent.click(getByRole(document.body, 'link', { name: 'Go to footnote' })));
  expect(scroll).toHaveBeenCalledOnce();
  expect(queryByRole(document.body, 'dialog')).toBeNull();
});

it('uses the global pinned note index for a zero-width marker in an earlier root and preserves overlapping marks', async () => {
  const entries: OrderedEntry[] = [
    { type: 'child', node: { logicalId: 'early', revisionId: 'r1', occurrenceId: 'o1', kind: 'article', label: '1', title: null, content: [
      { type: 'text', logicalId: 'text', text: 'Exact body.', marks: [{ type: 'bold', start: 0, end: 10 }, { type: 'italic', start: 6, end: 10 }], references: [{ logicalId: 'ref', start: 11, end: 11, target: { type: 'footnote', footnoteId: 'note' } }] },
    ] } },
    { type: 'child', node: { logicalId: 'last', revisionId: 'r2', occurrenceId: 'o2', kind: 'article', label: '2', title: null, content: [
      { type: 'text', logicalId: 'note', occurrenceId: 'note', format: 'footnote', footnoteLabel: '*', text: note.text },
    ] } },
  ];
  await act(async () => root.render(<FootnoteProvider notes={footnoteItems(entries)}><OrderedContentTree entries={[entries[0]]} /></FootnoteProvider>));
  expect(host.querySelector('strong em')?.textContent).toBe('body');
  expect(host.textContent).toContain('Exact body.');
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Show footnote *' })));
  expect(getByRole(document.body, 'dialog').textContent).toContain(note.text);
});

it('renders caption-free endnotes and localized drawer actions', async () => {
  await act(async () => root.render(<TranslationProvider locale="de"><FootnoteProvider notes={[note]}><FootnoteMarker noteId="note" /></FootnoteProvider></TranslationProvider>));
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Fußnote anzeigen *' })));
  expect(getByRole(document.body, 'link', { name: 'Zur Fußnote' })).toBeTruthy();
  expect(getByRole(document.body, 'button', { name: 'Fußnote schließen' })).toBeTruthy();
});

it('previews notes on hover and keyboard focus and dismisses the preview on Escape or scrolling', async () => {
  await act(async () => root.render(<FootnoteProvider notes={[note]}><FootnoteMarker noteId="note" /></FootnoteProvider>));
  const marker = getByRole(host, 'button', { name: 'Show footnote *' });
  expect(marker.getAttribute('href')).toBe('#fn-note');
  await act(async () => fireEvent.mouseOver(marker));
  expect(getByRole(document.body, 'tooltip').textContent).toContain(note.text);
  await act(async () => fireEvent.mouseOut(marker));
  expect(queryByRole(document.body, 'tooltip')).toBeNull();
  await act(async () => fireEvent.focusIn(marker));
  expect(getByRole(document.body, 'tooltip')).toBeTruthy();
  await act(async () => fireEvent.keyDown(document, { key: 'Escape' }));
  expect(queryByRole(document.body, 'tooltip')).toBeNull();
  await act(async () => fireEvent.focusIn(marker));
  await act(async () => window.dispatchEvent(new Event('scroll')));
  expect(queryByRole(document.body, 'tooltip')).toBeNull();
  await act(async () => fireEvent.keyDown(marker, { key: ' ' }));
  expect(getByRole(document.body, 'dialog')).toBeTruthy();
});

it('waits for an unloaded note destination before closing the drawer and navigating', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  const scroll = vi.fn(), navigate = vi.fn(async () => {});
  await act(async () => root.render(<FootnoteProvider notes={[note]} onNavigate={navigate}><FootnoteMarker noteId="note" /><aside id="fn-note">{note.text}</aside></FootnoteProvider>));
  host.querySelector<HTMLElement>('#fn-note')!.scrollIntoView = scroll;
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Show footnote *' })));
  expect(navigate).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(getByRole(document.body, 'link', { name: 'Go to footnote' })));
  expect(navigate).toHaveBeenCalledWith(note);
  expect(scroll).toHaveBeenCalledOnce();
  expect(queryByRole(document.body, 'dialog')).toBeNull();
});

it('renders a cursor note appended at a link start exactly once without losing the linked wording', async () => {
  const entry: OrderedEntry = { type: 'text', logicalId: 'text', text: 'Linked word.', references: [
    { logicalId: 'url', start: 0, end: 6, target: { type: 'external', url: 'https://example.org' } },
    { logicalId: 'point', start: 0, end: 0, target: { type: 'footnote', footnoteId: 'note' } },
  ] };
  await act(async () => root.render(<FootnoteProvider notes={[note]}><OrderedContentTree entries={[entry]} /></FootnoteProvider>));
  expect(host.querySelector('.constitution-body')?.textContent).toBe('*Linked word.');
  expect(getByRole(host, 'link', { name: 'Linked' }).getAttribute('href')).toBe('https://example.org');
  expect(getByRole(host, 'button', { name: 'Show footnote *' })).toBeTruthy();
});

it('keeps a failed destination readable, reports the failure and allows an explicit retry', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  const scroll = vi.fn(), navigate = vi.fn().mockRejectedValueOnce(new DOMException('signal timed out','TimeoutError')).mockResolvedValueOnce(undefined);
  await act(async () => root.render(<FootnoteProvider notes={[note]} onNavigate={navigate}><FootnoteMarker noteId="note" /><aside id="fn-note">{note.text}</aside></FootnoteProvider>));
  host.querySelector<HTMLElement>('#fn-note')!.scrollIntoView=scroll;
  await act(async () => fireEvent.click(getByRole(host,'button',{name:'Show footnote *'})));
  await act(async () => fireEvent.click(getByRole(document.body,'link',{name:'Go to footnote'})));
  expect(getByRole(document.body,'dialog').textContent).toContain(note.text);
  expect(getByRole(document.body,'alert').textContent).toContain('The footnote could not be loaded');
  expect(scroll).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(getByRole(document.body,'link',{name:'Go to footnote'})));
  expect(navigate).toHaveBeenCalledTimes(2);expect(scroll).toHaveBeenCalledOnce();expect(queryByRole(document.body,'dialog')).toBeNull();
});

it('retains focus on the navigation link when a pending destination refreshes the pinned note object', async () => {
  let finish!:()=>void;const navigate=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
  const render=(current:typeof note)=><FootnoteProvider notes={[current]} onNavigate={navigate}><FootnoteMarker noteId="note"/></FootnoteProvider>;
  await act(async()=>root.render(render(note)));
  await act(async()=>fireEvent.click(getByRole(host,'button',{name:'Show footnote *'})));
  const link=getByRole(document.body,'link',{name:'Go to footnote'});
  await act(async()=>{link.focus();fireEvent.click(link);});
  expect(link.getAttribute('aria-busy')).toBe('true');
  await act(async()=>root.render(render({...note})));
  expect(document.activeElement).toBe(link);
  await act(async()=>fireEvent.click(link));expect(navigate).toHaveBeenCalledOnce();
  await act(async()=>finish());expect(queryByRole(document.body,'dialog')).toBeNull();
});

it('keeps authored words linked to notes searchable without searching generated marker glyphs or changing the source', async () => {
  const entries: OrderedEntry[] = [
    { type: 'text', occurrenceId: 'wording', text: 'Die Freyheit jedes Bürgers.', references: [
      { logicalId: 'word-mark', start: 4, end: 12, target: { type: 'footnote', footnoteId: 'note' } },
      { logicalId: 'glyph-mark', start: 26, end: 26, target: { type: 'footnote', footnoteId: 'note' } },
    ] },
    { type: 'text', logicalId: 'note', occurrenceId: 'note-entry', format: 'footnote', footnoteLabel: '[a]', text: 'Source note.' },
  ];
  await act(async () => root.render(<OrderedContentTree entries={entries} hideFootnotes />));
  const original = host.innerHTML;
  expect(findReaderText(host, 'Freyheit').map(match => match.range.toString())).toEqual(['Freyheit']);
  expect(findReaderText(host, 'Die Freyheit jedes').map(match => match.range.toString())).toEqual(['Die Freyheit jedes']);
  expect(findReaderText(host, '[a]')).toHaveLength(0);
  expect(host.innerHTML).toBe(original);
});
