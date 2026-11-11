'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { fetchWithTimeout } from '../../../lib/fetch-with-timeout';
import type { DocumentFolder, DocumentLink, DocumentRecord, DocumentRevision, DocumentLibraryPage } from '../../../lib/document-api';
import type { DocumentReference } from '../../../lib/document-reference';
import { DocumentAttachmentTemplate } from './DocumentAttachmentTemplate';
import { useTranslation } from '../TranslationProvider';
import { Button, TextArea } from '../ui';

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);
async function read<T>(parameters: Record<string, string>): Promise<T> {
  const response = await fetchWithTimeout(`/editor/documents/command?${new URLSearchParams(parameters)}`);
  if (!response.ok) throw new Error('document');
  return response.json() as Promise<T>;
}

/** Local selection state. Uploads enter the library once; only the host commits relationships. */
export function StagedDocumentPicker({ name, form, heading, headingLevel = 'h2', initialReferences = [], references: controlledReferences, canEdit = true, canCreate = true, kind, onChoose, onChange, onLinksChange, onPendingChange, onDetach }: {
  name?: string; form?: string; heading?: string; headingLevel?: 'h2' | 'h3' | 'h4'; initialReferences?: DocumentReference[]; references?: DocumentReference[]; canEdit?: boolean; canCreate?: boolean; kind?: 'image';
  onChoose?: (link: DocumentLink) => boolean | Promise<boolean>;
  onChange?: (references: DocumentReference[]) => void;
  onLinksChange?: (links: DocumentLink[]) => void;
  onPendingChange?: (pending: boolean) => void;
  onDetach?: (documentId: string) => boolean | Promise<boolean>;
}) {
  const t = useTranslation(), id = useId();
  const [localReferences, setReferences] = useState(initialReferences), [links, setLinks] = useState<DocumentLink[]>([]);
  const references = controlledReferences ?? localReferences;
  const [documents, setDocuments] = useState<DocumentRecord[]>([]), [revisions, setRevisions] = useState<Record<string, DocumentRevision[]>>({});
  const [folders, setFolders] = useState<DocumentFolder[]>([]), [total, setTotal] = useState(0), [offset, setOffset] = useState(0);
  const browsing = useRef(false);
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('');
  useEffect(() => { onLinksChange?.(links); }, [links, onLinksChange]);
  useEffect(() => { onPendingChange?.(pending); }, [pending, onPendingChange]);
  useEffect(() => () => onPendingChange?.(false), [onPendingChange]);
  const selectedReferences = useRef(initialReferences);
  useEffect(() => { if (controlledReferences) selectedReferences.current = controlledReferences; }, [controlledReferences]);
  const controlledKey = controlledReferences ? JSON.stringify(controlledReferences) : null;
  const request = useRef(0), cache = useRef(new Map<string, DocumentRecord>()), operation = useRef({ key: '', id: '' }), busy = useRef(false);
  const fail = useCallback(() => setError(t({ en: 'Documents could not be loaded or saved. Your selections and text are preserved; please retry.', de: 'Dokumente konnten nicht geladen oder gespeichert werden. Deine Auswahl und Texte bleiben erhalten; bitte erneut versuchen.' })), [t]);
  const search = useCallback(async (q: string, pageOffset: number, folderId?: string) => {
    const attempt = ++request.current;
    try {
      const page = await read<DocumentLibraryPage>({ command: 'search', q, offset: String(pageOffset), ...(folderId ? { folderId } : {}), ...(kind ? { kind } : {}) });
      if (attempt !== request.current) return false;
      page.items.forEach(doc => cache.current.set(doc.id, doc));
      setDocuments(page.items); setTotal(page.total); setOffset(page.offset); setError(''); return true;
    } catch { if (attempt === request.current) fail(); return false; }
  }, [kind, fail]);
  function browse() {
    if (browsing.current) return;
    browsing.current = true;
    void search('', 0);
    void read<DocumentFolder[]>({ command: 'folders' }).then(setFolders).catch(fail);
  }
  async function hydrateSelection() {
    return Promise.all(selectedReferences.current.map(async ref => {
      const cached = cache.current.get(ref.documentId);
      const document = cached?.revision.revision === ref.revision ? cached : await read<DocumentRecord>({ command: 'document', documentId: ref.documentId, revision: String(ref.revision) });
      cache.current.set(document.id, document);
      return { documentId: document.id, revisionId: document.revision.id, document, citationNote: ref.citationNote };
    })).then(value => {
      setLinks(current => selectedReferences.current.flatMap(ref => {
        const link = current.find(item => item.documentId === ref.documentId && item.document.revision.revision === ref.revision) ?? value.find(item => item.documentId === ref.documentId && item.document.revision.revision === ref.revision);
        return link ? [{ ...link, citationNote: ref.citationNote }] : [];
      }));
    }).catch(fail);
  }
  useEffect(() => {
    void hydrateSelection();
    // Controlled owners can add inline citations without remounting unfinished uploads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledKey]);
  function changed(next: DocumentReference[]) { selectedReferences.current = next; setReferences(next); onChange?.(next); }
  async function choose(document: DocumentRecord, revision: DocumentRevision) {
    if (kind === 'image' && (!revision.fileName || !imageTypes.has(revision.contentType ?? ''))) { setError(t({ en: 'Choose a PNG, JPEG, GIF, WebP or AVIF file.', de: 'Wähle eine PNG-, JPEG-, GIF-, WebP- oder AVIF-Datei.' })); return false; }
    const link = { documentId: document.id, revisionId: revision.id, document: { ...document, revision }, citationNote: note.trim() };
    if (onChoose) return onChoose(link);
    setLinks(current => [...current.filter(item => item.documentId !== document.id), link]);
    changed([...references.filter(ref => ref.documentId !== document.id), { documentId: document.id, revision: revision.revision, ...(note.trim() ? { citationNote: note.trim() } : {}) }]);
    setNote(''); return true;
  }
  async function select(documentId: string) {
    if (!documentId || revisions[documentId]) return;
    try { const result = await read<{ revisions: DocumentRevision[] }>({ command: 'revisions', documentId }); setRevisions(current => ({ ...current, [documentId]: result.revisions })); }
    catch { fail(); }
  }
  async function create(data: FormData) {
    if (busy.current) return false;
    const file = data.get('file');
    if (kind === 'image' && (!(file instanceof File) || !imageTypes.has(file.type))) { fail(); return false; }
    busy.current = true; setPending(true); setError('');
    const key = JSON.stringify([...data.entries()].map(([key, value]) => [key, typeof value === 'string' ? value : [value.name, value.size, value.lastModified]]));
    if (operation.current.key !== key) operation.current = { key, id: crypto.randomUUID() };
    data.set('command', 'stage'); data.set('operationId', operation.current.id);
    try {
      const response = await fetchWithTimeout('/editor/documents/command', { method: 'POST', body: data }, fetch, 60_000);
      if (!response.ok) throw new Error('document');
      const { document } = await response.json() as { document: DocumentRecord };
      cache.current.set(document.id, document); setDocuments(current => [document, ...current.filter(item => item.id !== document.id)]);
      setRevisions(current => ({ ...current, [document.id]: [document.revision] }));
      return await choose(document, document.revision);
    } catch { fail(); return false; } finally { busy.current = false; setPending(false); }
  }
  return <>
    {error && references.some(ref => !links.some(link => link.documentId === ref.documentId)) ? <Button type="button" variant="ghost" onClick={() => void hydrateSelection()}>{t({ en: 'Reload selected sources', de: 'Ausgewählte Quellen erneut laden' })}</Button> : null}
    {name ? <input type="hidden" form={form} name={name} value={JSON.stringify(references)} /> : null}
    <DocumentAttachmentTemplate heading={heading} headingLevel={headingLevel} uploadAccept={kind === 'image' ? [...imageTypes].join(',') : undefined} uploadFileRequired={kind === 'image'} links={links} documents={documents} folders={folders} revisions={revisions} documentTotal={total} documentOffset={offset} pending={pending} error={error} notice={canCreate ? t({ en: 'Selections are saved with this record. Uploads are kept in the library.', de: 'Die Auswahl wird mit diesem Datensatz gespeichert. Hochgeladene Dokumente bleiben in der Bibliothek.' }) : t({ en: 'Selections are saved with this record.', de: 'Die Auswahl wird mit diesem Datensatz gespeichert.' })} canEdit={canEdit} canCreate={canCreate}
      onBrowse={browse} onSearch={search} onSelect={select} onCreate={create}
      contextFields={() => kind === 'image' ? null : <details><summary>{t({ en: 'Citation note / relevant passage', de: 'Zitiernotiz / relevante Stelle' })}</summary><TextArea form={`${id}-note`} label={t({ en: 'Note for this attachment', de: 'Notiz zu dieser Verknüpfung' })} rows={2} maxLength={4000} value={note} onChange={event => setNote(event.target.value)} /></details>}
      renderAttachmentContext={link => link.citationNote ? <p>{link.citationNote}</p> : null}
      onAttach={async (documentId, revisionId) => {
        const document = cache.current.get(documentId), revision = revisions[documentId]?.find(item => item.id === revisionId) ?? (document?.revision.id === revisionId ? document.revision : undefined);
        if (!document || !revision) { fail(); return false; }
        return choose(document, revision);
      }} onDetach={async documentId => { if (onDetach && !await onDetach(documentId)) return false; setLinks(current => current.filter(link => link.documentId !== documentId)); changed(references.filter(ref => ref.documentId !== documentId)); return true; }} />
  </>;
}
