'use client';

import { fetchWithTimeout } from '../../../lib/fetch-with-timeout';

import { useRef, useState } from 'react';
import type { DocumentLink, DocumentRecord, DocumentRevision } from '../../../lib/document-api';
import { useTranslation } from '../../components/TranslationProvider';
import { DocumentManagerTemplate } from './DocumentManagerTemplate';

export function DocumentManager(props: {
  links: DocumentLink[]; documents: DocumentRecord[]; revisions: Record<string, DocumentRevision[]>;
  targetType: 'constitution' | 'version' | 'amendment'; targetId: string; scopeRevisionId?: string | null; canEdit: boolean;
  documentTotal?: number; remoteSearch?: boolean;
}) {
  const t = useTranslation();
  const [links, setLinks] = useState(props.links), [documents, setDocuments] = useState(props.documents);
  const [revisions, setRevisions] = useState(props.revisions);
  const [total, setTotal] = useState(props.documentTotal ?? props.documents.length), [offset, setOffset] = useState(0);
  const [searchPending, setSearchPending] = useState(false), [revisionPending, setRevisionPending] = useState(false);
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const operation = useRef({ key: '', id: '' }), busy = useRef(false);
  const searchRequest = useRef(0), revisionRequest = useRef(0);
  async function search(query: string, pageOffset: number): Promise<boolean> {
    const requestId = ++searchRequest.current;
    setSearchPending(true); setError('');
    try {
      const parameters = new URLSearchParams({ command: 'search', q: query, offset: String(pageOffset) });
      const response = await fetchWithTimeout(`/editor/documents/command?${parameters}`);
      if (!response.ok) throw new Error('document');
      const page: { items: DocumentRecord[]; total: number; offset: number } = await response.json();
      if (requestId !== searchRequest.current) return false;
      setDocuments(page.items); setTotal(page.total); setOffset(page.offset);
      return true;
    } catch {
      if (requestId === searchRequest.current) setError(t({ en: 'The library search could not be loaded. Your document and text edits are still here.', de: 'Die Bibliothekssuche konnte nicht geladen werden. Deine Dokument- und Texteingaben bleiben erhalten.' }));
      return false;
    } finally { if (requestId === searchRequest.current) setSearchPending(false); }
  }
  async function select(documentId: string): Promise<void> {
    const requestId = ++revisionRequest.current;
    if (!documentId || revisions[documentId]) { setRevisionPending(false); return; }
    setRevisionPending(true); setError('');
    try {
      const parameters = new URLSearchParams({ command: 'revisions', documentId });
      const response = await fetchWithTimeout(`/editor/documents/command?${parameters}`);
      if (!response.ok) throw new Error('document');
      const result: { revisions: DocumentRevision[] } = await response.json();
      setRevisions(current => ({ ...current, [documentId]: result.revisions }));
    } catch {
      if (requestId === revisionRequest.current) setError(t({ en: 'Earlier revisions could not be loaded. You can retry by selecting the document again.', de: 'Frühere Revisionen konnten nicht geladen werden. Wähle das Dokument erneut aus, um es noch einmal zu versuchen.' }));
    } finally { if (requestId === revisionRequest.current) setRevisionPending(false); }
  }
  async function mutate(command: string, data = new FormData()): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true; setPending(true); setError(''); setNotice('');
    data.set('command', command); data.set('targetType', props.targetType); data.set('targetId', props.targetId); data.set('scopeRevisionId', props.scopeRevisionId ?? '');
    try {
      const response = await fetchWithTimeout('/editor/documents/command', { method: 'POST', body: data }, fetch, 60_000);
      if (!response.ok) throw new Error('document');
      const result: { document?: DocumentRecord; links?: DocumentLink[] } = await response.json();
      if (result.document) {
        const document = result.document;
        setDocuments(current => [document, ...current.filter(item => item.id !== document.id)]);
        setRevisions(current => ({ ...current, [document.id]: [document.revision] }));
        setLinks(current => [...current.filter(link => link.documentId !== document.id), { documentId: document.id, revisionId: document.revision.id, document }]);
        operation.current = { key: '', id: '' };
      } else if (result.links) setLinks(result.links);
      setNotice(t(command === 'detach' ? { en: 'Document detached. It remains in the library.', de: 'Verknüpfung gelöst. Das Dokument bleibt in der Bibliothek.' } : { en: 'Document attached.', de: 'Dokument verknüpft.' }));
      return true;
    } catch {
      setError(t({ en: 'The document could not be changed. Your edits are still here. Check your connection and retry; an upload retry will reuse the same document.', de: 'Das Dokument konnte nicht geändert werden. Deine Eingaben bleiben erhalten. Prüfe die Verbindung und versuche es erneut; ein erneuter Upload verwendet dasselbe Dokument.' }));
      return false;
    } finally { busy.current = false; setPending(false); }
  }
  return <DocumentManagerTemplate links={links} documents={documents} revisions={revisions} canEdit={props.canEdit} pending={pending} error={error} notice={notice}
    searchPending={searchPending} revisionPending={revisionPending} documentTotal={total} documentOffset={offset}
    onSearch={props.remoteSearch ? search : undefined} onSelect={props.remoteSearch ? select : undefined}
    onCreate={data => {
      const key = JSON.stringify([...data.entries()].map(([key, value]) => [key, typeof value === 'string' ? value : [value.name, value.size, value.lastModified]]));
      if (operation.current.key !== key) operation.current = { key, id: crypto.randomUUID() };
      data.set('operationId', operation.current.id);
      return mutate('create', data);
    }} onAttach={(id, revision) => { const data = new FormData(); data.set('documentId', id); data.set('revisionId', revision); return mutate('attach', data); }}
    onDetach={id => { const data = new FormData(); data.set('documentId', id); return mutate('detach', data); }} />;
}
