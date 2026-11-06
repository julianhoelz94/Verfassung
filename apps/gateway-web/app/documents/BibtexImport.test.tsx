import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, getByLabelText, getByRole } from '@testing-library/dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DocumentRecord } from '../../lib/document-api';
import { TranslationProvider } from '../components/TranslationProvider';
import { BibtexImport } from './BibtexImport';

const matched: DocumentRecord = { id: 'existing', citationKey: 'MyStableKey', currentRevision: 7, status: 'active', createdAt: '2020-01-01', revision: { id: 'rev7', documentId: 'existing', revision: 7, title: 'Federalism', description: null, sourceUrl: null, fileName: null, contentType: null, createdAt: '2020-01-01', createdBy: 'editor' } };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let host: HTMLDivElement, root: Root, send: ReturnType<typeof vi.fn>;
const imported = vi.fn();
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  imported.mockReset();
  send = vi.fn(); vi.stubGlobal('fetch', send);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it('imports into the chosen folder with explicit matches, retaining local keys and retry identity', async () => {
  send.mockResolvedValueOnce(json({ entries: [{ index: 0, citationKey: 'ImportedKey', title: 'Federalism', bibliography: { type: 'book', authors: [], editors: [], extra: {} }, duplicateCandidates: [matched], warnings: [] }], warnings: [] }))
    .mockResolvedValueOnce(json({ error: 'document' }, 502))
    .mockResolvedValueOnce(json({ documents: [matched], skipped: 0 }));
  await act(async () => root.render(<TranslationProvider locale="en"><BibtexImport folders={[{ id: 'project', name: 'Project', tagId: 'project-tag' }]} folderId="project" onImported={imported} onClose={() => {}} /></TranslationProvider>));
  await act(async () => fireEvent.change(getByLabelText(host, 'BibTeX content'), { target: { value: '@book{ImportedKey,title={Federalism}}' } }));
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Preview import', exact: true })));
  await act(async () => fireEvent.change(getByLabelText(host, 'Preview import: Federalism'), { target: { value: 'update' } }));
  await act(async () => fireEvent.change(getByLabelText(host, 'Existing document'), { target: { value: 'existing' } }));
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Import confirmed entries' })));
  expect(getByRole(host, 'alert').textContent).toContain('Your choices are preserved');
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Import confirmed entries' })));
  const attempts = send.mock.calls.slice(1).map(call => JSON.parse(call[1].body as string));
  expect(attempts[0]).toEqual(attempts[1]);
  expect(attempts[0]).toMatchObject({ command: 'bibtex-import', folderId: 'project', decisions: [{ index: 0, action: 'update', documentId: 'existing', expectedRevision: 7 }] });
  expect(attempts[0].decisions[0]).not.toHaveProperty('citationKey');
  expect(imported).toHaveBeenCalledWith([matched], 'project');
});
