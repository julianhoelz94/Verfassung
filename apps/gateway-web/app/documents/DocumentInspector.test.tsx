import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, getByLabelText, getByRole, queryByRole } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentRecord } from '../../lib/document-api';
import { TranslationProvider } from '../components/TranslationProvider';
import { DocumentInspector } from './DocumentInspector';

const record: DocumentRecord = {
  id: 'law', citationKey: 'GG1949', currentRevision: 2, status: 'active', createdAt: '2020-01-01', tags: [{ id: 'tag-a', name: 'Project A' }],
  revision: {
    id: 'revision-2', documentId: 'law', revision: 2, title: 'Basic Law', description: 'Original source', sourceUrl: 'https://example.org/law', fileName: 'law.pdf', contentType: 'application/pdf', createdAt: '2020-01-02', createdBy: 'editor', citationKey: 'GG1949',
    bibliography: { type: 'legislation', authors: [{ literal: 'Parliamentary Council' }], editors: [{ family: 'Müller', given: 'Anna' }], issued: '1949', extra: { jurisdiction: 'Germany', custom: '{Protected Capitalization}' } },
    attachments: [{ id: 'original', fileName: 'law.pdf', contentType: 'application/pdf', size: 12, sha256: 'checksum', primary: true }, { id: 'annex', fileName: 'annex.txt', contentType: 'text/plain', size: 8, sha256: 'checksum-2', primary: false }],
  },
};

let host: HTMLDivElement;
let root: Root;
let send: ReturnType<typeof vi.fn>;
const changed = vi.fn();
const dirtyChanged = vi.fn();
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const click = async (name: string) => act(async () => { fireEvent.click(getByRole(host, 'button', { name, exact: true })); });
const fill = async (name: string, value: string) => act(async () => { fireEvent.change(getByLabelText(host, name, { exact: true }), { target: { value } }); });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  send = vi.fn();
  changed.mockReset();
  dirtyChanged.mockReset();
  vi.stubGlobal('fetch', send);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); vi.unstubAllGlobals(); vi.useRealTimers();
});

async function render(writable = true, locale: 'en' | 'de' = 'en', selected = record) {
  await act(async () => root.render(<TranslationProvider locale={locale}><DocumentInspector document={selected} writable={writable} tags={record.tags} onChanged={changed} onClose={() => {}} onDirtyChange={dirtyChanged} /></TranslationProvider>));
}

describe('document inspector', () => {
  it('keeps folder membership separate from descriptive tags and can create a descriptive tag', async () => {
    send.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      return body.command === 'tag-create'
        ? response({ tag: { id: 'translation', name: 'Needs translation' } })
        : response({ document: { ...record, tags: [...record.tags!, { id: 'translation', name: 'Needs translation' }] } });
    });
    await act(async () => root.render(<TranslationProvider locale="en"><DocumentInspector document={record} writable tags={record.tags} folders={[{ id: 'project-a', name: 'Project A', tagId: 'tag-a' }]} onChanged={changed} onClose={() => {}} /></TranslationProvider>));
    await click('Tags');
    expect((getByRole(host, 'checkbox', { name: 'Project A' }) as HTMLInputElement).checked).toBe(true);
    expect(queryByRole(host, 'button', { name: 'Remove: Project A' })).toBeNull();
    await fill('New descriptive tag', 'Needs translation');
    await click('Create and add tag');
    expect(send.mock.calls.map(call => JSON.parse(call[1].body as string))).toEqual([
      { command: 'tag-create', name: 'Needs translation' },
      { command: 'tag-add', documentId: 'law', tagId: 'translation' },
    ]);
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ tags: expect.arrayContaining([{ id: 'translation', name: 'Needs translation' }]) }));
  });

  it('renames a descriptive tag without changing the document revision', async () => {
    send.mockResolvedValue(response({ tag: { id: 'tag-a', name: 'Renamed subject' } }));
    await render();
    await click('Tags');
    await click('Rename tag: Project A');
    await fill('Tag name', 'Renamed subject');
    await click('Save tag name');
    expect(JSON.parse(send.mock.calls[0][1].body as string)).toEqual({ command: 'tag-rename', tagId: 'tag-a', name: 'Renamed subject' });
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ currentRevision: 2, tags: [{ id: 'tag-a', name: 'Renamed subject' }] }));
  });

  it('preserves entered metadata after a citation-key or revision conflict', async () => {
    send.mockResolvedValue(response({ error: 'key_conflict' }, 409));
    await render();
    await fill('Title', 'Corrected Basic Law');
    await click('Save revision');
    expect(getByRole(host, 'alert').textContent).toContain('Your entries are preserved');
    expect((getByLabelText(host, 'Title', { exact: true }) as HTMLInputElement).value).toBe('Corrected Basic Law');
    expect(changed).not.toHaveBeenCalled();
    const body = JSON.parse(send.mock.calls[0][1].body as string);
    expect(body).toMatchObject({ command: 'revise', documentId: 'law', expectedRevision: 2, title: 'Corrected Basic Law', citationKey: 'GG1949' });
    expect(body.bibliography.authors).toEqual([{ literal: 'Parliamentary Council' }]);
    expect(body.bibliography.editors).toEqual([{ family: 'Müller', given: 'Anna' }]);
    expect(body.bibliography.extra).toEqual({ jurisdiction: 'Germany', custom: '{Protected Capitalization}' });
  });

  it('offers no document mutations to a reader while retaining exact file downloads', async () => {
    await render(false);
    expect(host.textContent).toContain('Read-only access');
    expect(queryByRole(host, 'button', { name: 'Save revision' })).toBeNull();
    await click('Files');
    expect(queryByRole(host, 'button', { name: 'Add attachment' })).toBeNull();
    expect(queryByRole(host, 'button', { name: 'Make primary' })).toBeNull();
    const links = host.querySelectorAll<HTMLAnchorElement>('a');
    expect(links[0].href).toContain('action=file&documentId=law&revision=2&attachmentId=original');
    expect(links[1].href).toContain('attachmentId=annex');
    await click('Tags');
    expect(host.textContent).toContain('Project A');
    expect(queryByRole(host, 'button', { name: 'Remove: Project A' })).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('changes the primary attachment with its expected revision', async () => {
    send.mockResolvedValue(response({ document: { ...record, currentRevision: 3 } }));
    await render(); await click('Files'); await click('Make primary');
    expect(JSON.parse(send.mock.calls[0][1].body as string)).toEqual({ command: 'attachment-primary', documentId: 'law', expectedRevision: 2, attachmentId: 'annex' });
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ id: 'law', currentRevision: 3 }));
  });

  it('loads history lazily and downloads each historical manifest through its pinned revision', async () => {
    send.mockResolvedValue(response({ revisions: [{ ...record.revision, id: 'revision-1', revision: 1 }], events: [] }));
    await render(false);
    expect(send).not.toHaveBeenCalled();
    await click('History');
    expect(send.mock.calls[0][0]).toBe('/documents/command?action=history&documentId=law');
    expect(host.querySelector<HTMLAnchorElement>('a')?.href).toContain('revision=1&attachmentId=original');
  });

  it('uses German controls and descriptions in the localized workspace', async () => {
    await render(false, 'de');
    expect(getByRole(host, 'button', { name: 'Literaturangaben' })).toBeTruthy();
    await click('Dateien');
    expect(host.textContent).toContain('Hauptdatei');
    expect(queryByRole(host, 'button', { name: 'Datei hinzufügen' })).toBeNull();
  });

  it('tracks unsaved metadata across file operations and clears the warning only after saving it', async () => {
    const attached = { ...record, currentRevision: 3, revision: { ...record.revision, revision: 3 } };
    const saved = { ...attached, currentRevision: 4, revision: { ...attached.revision, revision: 4, title: 'Corrected Basic Law' } };
    send.mockResolvedValueOnce(response({ document: attached })).mockResolvedValueOnce(response({ document: saved }));
    await render();
    expect(dirtyChanged).toHaveBeenLastCalledWith(false);
    const cleanUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanUnload);
    expect(cleanUnload.defaultPrevented).toBe(false);
    await fill('Title', 'Corrected Basic Law');
    expect(dirtyChanged).toHaveBeenLastCalledWith(true);
    const dirtyUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirtyUnload);
    expect(dirtyUnload.defaultPrevented).toBe(true);
    await click('Files'); await click('Make primary');
    await render(true, 'en', attached);
    expect(dirtyChanged).toHaveBeenLastCalledWith(true);
    await click('Bibliography');
    expect((getByLabelText(host, 'Title', { exact: true }) as HTMLInputElement).value).toBe('Corrected Basic Law');
    await click('Save revision');
    expect(JSON.parse(send.mock.calls[1][1].body as string).expectedRevision).toBe(3);
    expect(dirtyChanged).toHaveBeenLastCalledWith(false);
    const savedUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(savedUnload);
    expect(savedUnload.defaultPrevented).toBe(false);
  });

  it('stops reporting dirty when edits are reverted or the inspector unmounts', async () => {
    await render(); await fill('Title', 'Temporary change');
    expect(dirtyChanged).toHaveBeenLastCalledWith(true);
    await fill('Title', record.revision.title);
    expect(dirtyChanged).toHaveBeenLastCalledWith(false);
    await fill('Title', 'Another change');
    await act(async () => root.render(null));
    expect(dirtyChanged).toHaveBeenLastCalledWith(false);
  });

  it('keeps BibTeX codec metadata out of the fields and preserves it on a metadata save', async () => {
    const imported = { ...record, revision: { ...record.revision, bibliography: { ...record.revision.bibliography!, extra: {
      custom: 'Visible imported value', '$bibtex.raw.title': '{Protected Original}', '$bibtex.value.title': 'Protected Original',
    } } } };
    send.mockResolvedValue(response({ document: imported }));
    await render(true, 'en', imported);
    expect(host.textContent).not.toContain('$bibtex.');
    const name = getByLabelText(host, 'Field name', { exact: true }) as HTMLInputElement;
    expect(name.value).toBe('custom');
    await fill('Title', 'Updated title'); await click('Save revision');
    expect(JSON.parse(send.mock.calls[0][1].body as string).bibliography.extra).toEqual(imported.revision.bibliography.extra);
    await render(false, 'en', imported);
    expect(host.textContent).not.toContain('$bibtex.');
    expect(host.textContent).not.toContain('Protected Original');
    expect(host.textContent).toContain('Visible imported value');
  });

  it('uses a human action label for usage links and puts record identifiers in details', async () => {
    send.mockResolvedValue(response([{ id: 'link', targetType: 'amendment', targetId: 'record-id', documentId: record.id, revisionId: record.revision.id, scopeRevisionId: 'scope', action: 'attach', actorId: 'editor', occurredAt: '2020-01-01' }]));
    await render(false); await click('Usage');
    expect(getByRole(host, 'link', { name: 'Open legal change' }).getAttribute('href')).toBe('/editor/amendments/record-id');
    expect(host.querySelector('details code')?.textContent).toBe('record-id');
    expect(host.querySelector('details')?.open).toBe(false);
  });

  it.each([
    ['en', 'Document created', 'Metadata updated', 'File added', 'Primary file changed', 'Tag added: Project A', 'Tag removed', 'Document archived', 'Document changed'],
    ['de', 'Dokument erstellt', 'Literaturangaben aktualisiert', 'Datei hinzugefügt', 'Hauptdatei geändert', 'Schlagwort hinzugefügt: Project A', 'Schlagwort entfernt', 'Dokument archiviert', 'Dokument geändert'],
  ] as const)('uses readable activity labels in %s without showing event codes or tag identifiers', async (locale, ...expectedLabels) => {
    const eventTypes = ['created', 'revised', 'attachment_added', 'primary_attachment_changed', 'tag_added:tag-a', 'tag_removed:deleted-tag', 'archived', 'future_event:opaque-id'];
    send.mockResolvedValue(response({ revisions: [], events: eventTypes.map((eventType, index) => ({ id: `event-${index}`, eventType, occurredAt: '2020-01-01' })) }));
    await render(false, locale); await click(locale === 'de' ? 'Verlauf' : 'History');
    for (const label of expectedLabels) expect(host.textContent).toContain(label);
    expect(host.textContent).not.toContain('tag_added:');
    expect(host.textContent).not.toContain('attachment_added');
    expect(host.textContent).not.toContain('deleted-tag');
    expect(host.textContent).not.toContain('opaque-id');
  });
});
