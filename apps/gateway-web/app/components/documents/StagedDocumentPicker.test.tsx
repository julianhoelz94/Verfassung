import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, getByRole, getByLabelText } from '@testing-library/dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StagedDocumentPicker } from './StagedDocumentPicker';
import type { DocumentRecord } from '../../../lib/document-api';

const doc: DocumentRecord = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', currentRevision: 2, status: 'active', createdAt: '2026-01-01', revision: { id: 'pin2', documentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', revision: 2, title: 'Official source', fileName: null, contentType: null, sourceUrl: 'https://example.org/source', description: null, createdAt: '2026-01-01', createdBy: 'editor' } };
let host: HTMLDivElement, root: Root;
const requests: { method: string; url: string; body?: FormData }[] = [];
const click = (name: string) => act(async () => { fireEvent.click(getByRole(host, 'button', { name, exact: true })); });
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  requests.length = 0; host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input), command = new URL(url, 'https://atlas.test').searchParams.get('command');
    requests.push({ method: init?.method ?? 'GET', url, body: init?.body as FormData });
    return new Response(JSON.stringify(command === 'folders' ? [] : command === 'revisions' ? { revisions: [doc.revision] } : command === 'document' ? doc : { items: [doc], total: 1, offset: 0, limit: 30 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

it('stages a revision and scoped note in the owner form without writing a relationship', async () => {
  await act(async () => root.render(<><form id="owner"><input name="title" defaultValue="Unsaved amendment" /></form><StagedDocumentPicker form="owner" name="documents" /></>));
  expect(requests).toHaveLength(0);
  await click('Choose existing document');
  const search = getByRole(host, 'combobox', { name: 'Search documents' });
  await act(async () => { fireEvent.change(search, { target: { value: 'archive' } }); });
  expect(requests.some(request => new URL(request.url, 'https://atlas.test').searchParams.get('command') === 'revisions')).toBe(false);
  await act(async () => { fireEvent.focus(search); fireEvent.keyDown(search, { key: 'ArrowDown' }); });
  await act(async () => { fireEvent.keyDown(search, { key: 'Enter' }); });
  await act(async () => { fireEvent.change(getByLabelText(host, 'Note for this attachment'), { target: { value: 'Chapter 3, p. 42' } }); });
  await click('Attach document');
  const data = new FormData(host.querySelector('form')!);
  expect(data.get('title')).toBe('Unsaved amendment');
  expect(JSON.parse(String(data.get('documents')))).toEqual([{ documentId: doc.id, revision: 2, citationNote: 'Chapter 3, p. 42' }]);
  expect(requests.every(request => request.method === 'GET')).toBe(true);
  await click('Detach: Official source'); expect(JSON.parse(String(new FormData(host.querySelector('form')!).get('documents')))).toEqual([]);
});

it('reuses the upload operation after a failed request and keeps required upload fields out of owner validation', async () => {
  let attempt = 0;
  const operations: string[] = [];
  vi.mocked(fetch).mockImplementation(async (_input, init) => {
    const body = init?.body as FormData; operations.push(String(body.get('operationId'))); attempt++;
    return new Response(JSON.stringify(attempt === 1 ? { error: 'unavailable' } : { document: doc }), { status: attempt === 1 ? 502 : 200 });
  });
  await act(async () => root.render(<form><StagedDocumentPicker name="documents" /><input name="title" defaultValue="Draft" /></form>));
  await click('Upload new document');
  expect((getByLabelText(host, 'Title', { exact: true }) as HTMLInputElement).form).toBeNull();
  expect(host.querySelector('form')!.checkValidity()).toBe(true);
  await act(async () => { fireEvent.change(getByLabelText(host, 'Title', { exact: true }), { target: { value: 'Official source' } }); fireEvent.change(getByLabelText(host, 'Source URL'), { target: { value: 'https://example.org/source' } }); });
  await click('Create and attach');
  expect((getByLabelText(host, 'Title', { exact: true }) as HTMLInputElement).value).toBe('Official source');
  await click('Create and attach');
  expect(operations[0]).toBeTruthy(); expect(operations[1]).toBe(operations[0]);
  expect(JSON.parse(String(new FormData(host.querySelector('form')!).get('documents')))).toMatchObject([{ documentId: doc.id, revision: 2 }]);
});
