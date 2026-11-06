import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, getByLabelText, getByRole, getByText, queryByRole } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentManager } from './DocumentManager';
import type { DocumentRecord, DocumentRevision } from '../../../lib/document-api';
import { fetchWithTimeout } from '../../../lib/fetch-with-timeout';

vi.mock('../../../lib/fetch-with-timeout', () => ({ fetchWithTimeout: vi.fn() }));
const send = vi.mocked(fetchWithTimeout);
const revision: DocumentRevision = { id: 'revision-1', documentId: 'law', revision: 1, title: 'Enacting law', description: 'Legal basis', sourceUrl: 'https://example.org/law', fileName: null, contentType: null, createdAt: '2020-01-01', createdBy: 'editor' };
const documentRecord: DocumentRecord = { id: 'law', currentRevision: 1, status: 'active', createdAt: '2020-01-01', revision };
let host: HTMLDivElement, root: Root;
const click = async (name: string) => act(async () => { fireEvent.click(getByRole(host, 'button', { name, exact: true })); });
const fill = async (label: string, value: string) => act(async () => { fireEvent.change(getByLabelText(host, label, { exact: true }), { target: { value } }); });
const submitted = (index: number) => send.mock.calls[index][1]!.body as FormData;
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  send.mockReset(); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function render(props: Partial<Parameters<typeof DocumentManager>[0]> = {}) {
  await act(async () => root.render(<DocumentManager targetType="amendment" targetId="amendment" scopeRevisionId="draft-revision" links={[]} documents={[]} revisions={{}} canEdit {...props} />));
}

describe('shared document attachment contract', () => {
  it('retains external-law input after a lost response and retries the same operation in place', async () => {
    send.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce(response({ document: documentRecord }));
    await render(); await click('Upload new document');
    await fill('Title', 'Enacting law'); await fill('Source URL', 'https://example.org/law'); await fill('Description', 'Legal basis');
    await click('Choose existing document'); await click('Upload new document');
    expect((getByLabelText(host, 'Title', { exact: true }) as HTMLInputElement).value).toBe('Enacting law');
    await click('Create and attach');
    expect(getByRole(host, 'alert').textContent).toContain('Your edits are still here');
    expect((getByLabelText(host, 'Source URL') as HTMLInputElement).value).toBe('https://example.org/law');
    const first = submitted(0);
    expect(Object.fromEntries(first)).toMatchObject({ command: 'create', targetType: 'amendment', targetId: 'amendment', scopeRevisionId: 'draft-revision', title: 'Enacting law', sourceUrl: 'https://example.org/law', description: 'Legal basis' });
    expect(first.get('file')).toBeNull(); expect(first.get('operationId')).toBeTruthy();
    await act(async () => { fireEvent.keyDown(getByLabelText(host, 'Title', { exact: true }), { key: 'Enter' }); });
    expect(submitted(1).get('operationId')).toBe(first.get('operationId'));
    expect(getByRole(host, 'link', { name: 'Enacting law' }).getAttribute('href')).toBe('/documents/law?revision=1');
    expect(queryByRole(host, 'alert')).toBeNull(); expect(getByRole(host, 'status').textContent).toBe('Document attached.');
  });

  it('creates a file record and pinned attachment in one request, then clears the completed upload', async () => {
    send.mockResolvedValue(response({ document: { ...documentRecord, revision: { ...revision, fileName: 'law.txt' } } }));
    await render(); await click('Upload new document');
    const file = new File(['Original legal wording.'], 'law.txt', { type: 'text/plain', lastModified: 1 });
    await act(async () => { fireEvent.change(getByLabelText(host, 'File', { exact: true }), { target: { files: [file] } }); });
    expect((getByLabelText(host, 'Title', { exact: true }) as HTMLInputElement).value).toBe('law');
    await click('Upload and attach');
    expect(send).toHaveBeenCalledTimes(1); expect(submitted(0).get('file')).toBe(file);
    expect(submitted(0).get('command')).toBe('create'); expect(host.textContent).toContain('law.txt');
    await click('Upload new document');
    expect((getByLabelText(host, 'Title', { exact: true }) as HTMLInputElement).value).toBe('');
    expect(getByRole(host, 'button', { name: 'Create and attach' })).toBeTruthy();
  });

  it('reuses the selected historical revision without creating or revising the library record', async () => {
    const latest = { ...revision, id: 'revision-2', revision: 2, title: 'Later title' };
    const current = { ...documentRecord, currentRevision: 2, revision: latest };
    const linked = { documentId: 'law', revisionId: revision.id, document: documentRecord };
    send.mockResolvedValueOnce(response({ links: [linked] })).mockResolvedValueOnce(response({ links: [] }));
    await render({ documents: [current], revisions: { law: [revision, latest] } });
    await click('Choose existing document'); await fill('Search documents', 'Later');
    await act(async () => { fireEvent.click(getByRole(host, 'option', { name: /^Later title/ })); }); await act(async () => { fireEvent.click(getByText(host, 'Citation options', { selector: 'summary' })); }); await fill('Revision to cite', 'revision-1'); await click('Attach document');
    expect(Object.fromEntries(submitted(0))).toMatchObject({ command: 'attach', documentId: 'law', revisionId: 'revision-1', scopeRevisionId: 'draft-revision' });
    expect(getByRole(host, 'link', { name: 'Enacting law' }).getAttribute('href')).toBe('/documents/law?revision=1');
    await click('Detach: Enacting law'); expect(queryByRole(host, 'link', { name: 'Enacting law' })).toBeNull();
    expect(submitted(1).get('command')).toBe('detach');
    await click('Choose existing document'); await fill('Search documents', '');
    expect(getByRole(host, 'option', { name: 'Later title' })).toBeTruthy();
    expect(send.mock.calls.every((_, index) => submitted(index).get('command') !== 'create')).toBe(true);
  });

  it('keeps linked evidence visible in read-only views without exposing mutation controls', async () => {
    await render({ canEdit: false, links: [{ documentId: 'law', revisionId: revision.id, document: documentRecord }] });
    expect(getByRole(host, 'link', { name: 'Enacting law' })).toBeTruthy();
    expect(queryByRole(host, 'button', { name: 'Upload new document' })).toBeNull();
    expect(queryByRole(host, 'button', { name: 'Choose existing document' })).toBeNull();
    expect(queryByRole(host, 'button', { name: /^Detach/ })).toBeNull(); expect(send).not.toHaveBeenCalled();
  });

  it('rejects an empty evidence record before sending a mutation', async () => {
    await render(); await click('Upload new document'); await fill('Title', 'Missing source');
    await click('Create and attach'); expect(getByRole(host, 'alert').textContent).toContain('Choose a file or enter its source URL under Optional details.');
    expect(send).not.toHaveBeenCalled();
  });

  it('searches beyond the first page and lazily fetches only selected document revisions', async () => {
    const latest = { ...revision, id: 'revision-2', revision: 2, title: 'Later title' };
    const current = { ...documentRecord, currentRevision: 2, revision: latest };
    send.mockResolvedValueOnce(response({ items: [current], total: 65, offset: 0, limit: 30 }))
      .mockResolvedValueOnce(response({ items: [current], total: 65, offset: 30, limit: 30 }))
      .mockResolvedValueOnce(response({ revisions: [latest, revision] }))
      .mockResolvedValueOnce(response({ links: [{ documentId: 'law', revisionId: revision.id, document: documentRecord }] }));
    await render({ remoteSearch: true, documentTotal: 0 });
    expect(send).not.toHaveBeenCalled();
    await click('Choose existing document'); await fill('Search documents', 'Mueller2024'); await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
    expect(send.mock.calls[0][0]).toBe('/editor/documents/command?command=search&q=Mueller2024&offset=0');
    expect(queryByRole(host, 'option', { name: 'Revision 1' })).toBeNull();
    await click('Next');
    expect(send.mock.calls[1][0]).toBe('/editor/documents/command?command=search&q=Mueller2024&offset=30');
    await act(async () => { fireEvent.click(getByRole(host, 'option', { name: /^Later title/ })); });
    expect(send.mock.calls[2][0]).toBe('/editor/documents/command?command=revisions&documentId=law');
    await act(async () => { fireEvent.click(getByText(host, 'Citation options', { selector: 'summary' })); }); await fill('Revision to cite', 'revision-1'); await click('Attach document');
    expect(Object.fromEntries(submitted(3))).toMatchObject({ command: 'attach', documentId: 'law', revisionId: 'revision-1' });
    expect(getByRole(host, 'link', { name: 'Enacting law' }).getAttribute('href')).toBe('/documents/law?revision=1');
  });
});
