import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, getByLabelText, getByRole, queryByRole } from '@testing-library/dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DocumentFolder, DocumentRecord } from '../../lib/document-api';
import { DocumentLibrary } from './DocumentLibrary';
import { TranslationProvider } from '../components/TranslationProvider';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('./DocumentInspector', () => ({ DocumentInspector: ({ document, onChanged, onDirtyChange, onClose }: { document: DocumentRecord | null; onChanged: (document: DocumentRecord) => void; onDirtyChange: (dirty: boolean) => void; onClose: () => void }) => <div data-inspector-document={document?.id ?? 'new'}><input aria-label="Inspector title" defaultValue={document?.revision.title ?? ''} onChange={() => onDirtyChange(true)} /><button onClick={() => onChanged(record)}>Commit document</button><button onClick={() => { delayedMutation = onChanged; }}>Begin delayed save</button><button onClick={() => onDirtyChange(true)}>Edit metadata</button><button onClick={onClose}>Back to list</button></div> }));
const folders: DocumentFolder[] = [{ id: 'folder-a', name: 'Project A', tagId: 'tag-a' }, { id: 'folder-b', name: 'Project B', tagId: 'tag-b' }];
const record: DocumentRecord = { id: 'law', citationKey: 'Law1949', currentRevision: 1, status: 'active', createdAt: '2020-01-01', tags: [{ id: 'tag-a', name: 'Project A' }], revision: { id: 'revision', documentId: 'law', revision: 1, title: 'Basic Law', description: null, sourceUrl: null, fileName: null, contentType: null, createdAt: '2020-01-01', createdBy: 'editor' } };
let host: HTMLDivElement, root: Root, send: ReturnType<typeof vi.fn>, stored: DocumentRecord;
let delayedMutation: ((document: DocumentRecord) => void) | null = null;
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, '', '/documents');
  stored = structuredClone(record);
  delayedMutation = null;
  send = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      const body = JSON.parse(options.body as string);
      if (body.command === 'tag-add') stored.tags = [...(stored.tags ?? []), { id: body.tagId, name: folders.find(folder => folder.tagId === body.tagId)?.name ?? 'Tag' }];
      if (body.command === 'tag-remove') stored.tags = stored.tags?.filter(tag => tag.id !== body.tagId);
      return json({ document: stored });
    }
    if (url.includes('action=organization')) return json({ folders, tags: folders.map(folder => ({ id: folder.tagId, name: folder.name })) });
    return json({ items: [stored], total: 1, offset: 0, limit: 30 });
  });
  vi.stubGlobal('fetch', send);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render(writable = true, initialNew = false, initialDocument: DocumentRecord | null = null, items = [stored]) {
  await act(async () => root.render(<TranslationProvider locale="en"><DocumentLibrary initialPage={{ items, total: items.length, offset: 0, limit: 30 }} initialFolders={folders} initialTags={folders.map(folder => ({ id: folder.tagId, name: folder.name }))} initialQuery={{ folderId: 'folder-a', status: 'active' }} initialDocument={initialDocument} initialNew={initialNew} writable={writable} /></TranslationProvider>));
}

it('adds and undoes one folder tag without changing another membership or a document revision', async () => {
  await render();
  await act(async () => fireEvent.click(getByLabelText(host, 'Select: Basic Law')));
  await act(async () => fireEvent.change(getByLabelText(host, 'Add to folder', { exact: true }), { target: { value: 'folder-b' } }));
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Add to folder', exact: true })));
  expect(stored.tags?.map(tag => tag.id)).toEqual(['tag-a', 'tag-b']);
  expect(stored.currentRevision).toBe(1);
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Undo', exact: true })));
  expect(stored.tags?.map(tag => tag.id)).toEqual(['tag-a']);
  expect(stored.id).toBe('law');
  expect(send.mock.calls.filter(call => call[1]?.method === 'POST').map(call => JSON.parse(call[1].body as string))).toEqual([
    { command: 'tag-add', documentId: 'law', tagId: 'tag-b' }, { command: 'tag-remove', documentId: 'law', tagId: 'tag-b' },
  ]);
});

it('exports the whole folder independently of list pagination and hides mutations for readers', async () => {
  await render(false);
  await act(async () => fireEvent.click(host.querySelector('summary')!));
  expect(getByRole(host, 'link', { name: 'BibTeX only (.bib)' }).getAttribute('href')).toBe('/documents/command?action=export&folderId=folder-a');
  expect(getByRole(host, 'link', { name: 'BibTeX with files (.zip)' }).getAttribute('href')).toBe('/documents/command?action=export&folderId=folder-a&includeFiles=true');
  expect(queryByRole(host, 'button', { name: 'New document' })).toBeNull();
  expect(queryByRole(host, 'button', { name: 'Import BibTeX' })).toBeNull();
  expect(queryByRole(host, 'button', { name: 'New folder' })).toBeNull();
  expect(host.querySelector('[draggable="true"]')).toBeNull();
});

it('files a newly created document in the selected folder and leaves a stable document URL', async () => {
  stored.tags = [];
  await render(true, true);
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Commit document' })));
  expect(stored.tags?.map(tag => tag.id)).toEqual(['tag-a']);
  expect(window.location.search).toContain('documentId=law');
  expect(window.location.search).not.toContain('new=1');
});

it('requires explicit discard before replacing a document but keeps drafts when hiding the drawer', async () => {
  await render(true, false, stored);
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Edit metadata' })));
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'New document', exact: true })));
  expect(getByRole(host, 'alertdialog').textContent).toContain('Discard unsaved changes?');
  expect(host.querySelector('[data-inspector-document="law"]')).not.toBeNull();
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Keep editing' })));
  expect(queryByRole(host, 'alertdialog')).toBeNull();
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Back to list' })));
  expect(queryByRole(host, 'alertdialog')).toBeNull();
  expect(queryByRole(host, 'dialog')).toBeNull();
  expect(host.querySelector('[data-inspector-document="law"]')).not.toBeNull();
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Show document details' })));
  expect(getByRole(host, 'dialog')).toBeTruthy();
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'New document', exact: true })));
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Discard changes' })));
  expect(host.querySelector('[data-inspector-document="new"]')).not.toBeNull();
});

it('uses the shared toolbar to toggle project folders without a duplicated tag menu', async () => {
  await render();
  expect(getByRole(host, 'navigation', { name: 'Documents toolbar' })).toBeTruthy();
  const button = getByRole(host, 'button', { name: 'Hide project folders' });
  const navigation = document.getElementById(button.getAttribute('aria-controls')!);
  expect(navigation?.hidden).toBe(false);
  await act(async () => fireEvent.click(button));
  expect(navigation?.hidden).toBe(true);
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Show project folders' })));
  expect(navigation?.hidden).toBe(false);
  expect(queryByRole(host, 'heading', { name: 'Tags', exact: true })).toBeNull();
});

it('retains Undo for completed memberships after a partial bulk failure', async () => {
  const second = { ...stored, id: 'second', revision: { ...stored.revision, documentId: 'second', title: 'Another source' } };
  const original = send.getMockImplementation()!;
  send.mockImplementation(async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST' && JSON.parse(options.body as string).documentId === 'second') return new Response('{}', { status: 409 });
    return original(url, options);
  });
  await render(true, false, null, [stored, second]);
  await act(async () => fireEvent.click(getByLabelText(host, 'Select this page')));
  await act(async () => fireEvent.change(getByLabelText(host, 'Add to folder', { exact: true }), { target: { value: 'folder-b' } }));
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Add to folder', exact: true })));
  expect(getByRole(host, 'alert').textContent).toContain('Some documents were updated');
  expect(stored.tags?.map(tag => tag.id)).toEqual(['tag-a', 'tag-b']);
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Undo', exact: true })));
  expect(stored.tags?.map(tag => tag.id)).toEqual(['tag-a']);
});

it('selects a newly created document before slow folder assignment completes', async () => {
  let finish!: (value: Response) => void;
  const original = send.getMockImplementation()!;
  send.mockImplementation((url: string, options?: RequestInit) => options?.method === 'POST' ? new Promise<Response>(resolve => { finish = resolve; }) : original(url, options));
  await render(true, true);
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Commit document' })));
  expect(host.querySelector('[data-inspector-document="law"]')).not.toBeNull();
  expect(host.querySelector('[data-inspector-document="new"]')).toBeNull();
  await act(async () => finish(new Response('{}', { status: 503 })));
  expect(getByRole(host, 'alert').textContent).toContain('The document was created');
  expect(window.location.search).toContain('documentId=law');
});

it('does not let delayed creation/tagging or an old save steal a newer dirty selection', async () => {
  let finish!: (value: Response) => void;
  const second = { ...stored, id: 'second', revision: { ...stored.revision, documentId: 'second', title: 'Another source' } };
  const original = send.getMockImplementation()!;
  send.mockImplementation((url: string, options?: RequestInit) => {
    if (options?.method === 'POST') return new Promise<Response>(resolve => { finish = resolve; });
    if (url.includes('action=document&documentId=second')) return Promise.resolve(json(second));
    return original(url, options);
  });
  await render(true, true, null, [stored, second]);
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Commit document' })));
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Begin delayed save' })));
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Another source', exact: true })));
  await act(async () => fireEvent.change(getByLabelText(host, 'Inspector title'), { target: { value: 'Unsaved wording for B' } }));
  await act(async () => finish(json({ document: { ...stored, tags: [...(stored.tags ?? []), { id: 'tag-b', name: 'Project B' }] } })));
  await act(async () => delayedMutation?.({ ...stored, currentRevision: 2 }));
  expect(host.querySelector('[data-inspector-document="second"]')).not.toBeNull();
  expect((getByLabelText(host, 'Inspector title') as HTMLInputElement).value).toBe('Unsaved wording for B');
  expect(window.location.search).toContain('documentId=second');
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'New document', exact: true })));
  expect(getByRole(host, 'alertdialog')).toBeTruthy();
});

it('keeps the displayed inspector generation while another document is still loading', async () => {
  let finishSelection!: (value: Response) => void;
  const second = { ...stored, id: 'second', revision: { ...stored.revision, documentId: 'second', title: 'Another source' } };
  const original = send.getMockImplementation()!;
  send.mockImplementation((url: string, options?: RequestInit) => url.includes('action=document&documentId=second') ? new Promise<Response>(resolve => { finishSelection = resolve; }) : original(url, options));
  await render(true, false, stored, [stored, second]);
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Another source', exact: true })));
  // Force an unrelated render while A is still displayed and B's read is pending.
  expect((getByLabelText(host, 'Inspector title') as HTMLInputElement).matches(':disabled')).toBe(true);
  await act(async () => fireEvent.click(getByLabelText(host, 'Select: Basic Law')));
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Begin delayed save' })));
  await act(async () => delayedMutation?.({ ...stored, currentRevision: 2 }));
  expect(window.location.search).toContain('documentId=second');
  await act(async () => finishSelection(json(second)));
  expect(host.querySelector('[data-inspector-document="second"]')).not.toBeNull();
  expect(window.location.search).toContain('documentId=second');
});

it('does not let a slow bulk tag update replace another document being edited', async () => {
  let finish!: (value: Response) => void;
  const second = { ...stored, id: 'second', revision: { ...stored.revision, documentId: 'second', title: 'Another source' } };
  const original = send.getMockImplementation()!;
  send.mockImplementation((url: string, options?: RequestInit) => {
    if (options?.method === 'POST') return new Promise<Response>(resolve => { finish = resolve; });
    if (url.includes('action=document&documentId=second')) return Promise.resolve(json(second));
    return original(url, options);
  });
  await render(true, false, stored, [stored, second]);
  await act(async () => fireEvent.click(getByLabelText(host, 'Select: Basic Law')));
  await act(async () => fireEvent.change(getByLabelText(host, 'Add to folder', { exact: true }), { target: { value: 'folder-b' } }));
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Add to folder', exact: true })));
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Another source', exact: true })));
  await act(async () => fireEvent.change(getByLabelText(host, 'Inspector title'), { target: { value: 'Keep B edits' } }));
  await act(async () => finish(json({ document: { ...stored, tags: [...(stored.tags ?? []), { id: 'tag-b', name: 'Project B' }] } })));
  expect(host.querySelector('[data-inspector-document="second"]')).not.toBeNull();
  expect((getByLabelText(host, 'Inspector title') as HTMLInputElement).value).toBe('Keep B edits');
  expect(window.location.search).toContain('documentId=second');
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'New document', exact: true })));
  expect(getByRole(host, 'alertdialog')).toBeTruthy();
});
