'use client';

import { fetchWithTimeout } from '../../../lib/fetch-with-timeout';

import { useRef, useState } from 'react';
import type { DocumentLink, DocumentRecord, DocumentRevision } from '../../../lib/document-api';
import { useTranslation } from '../../components/TranslationProvider';
import { DocumentManagerTemplate } from './DocumentManagerTemplate';

export function DocumentManager(props: {
  links: DocumentLink[]; documents: DocumentRecord[]; revisions: Record<string, DocumentRevision[]>;
  targetType: 'constitution' | 'version' | 'amendment'; targetId: string; scopeRevisionId?: string | null; canEdit: boolean;
}) {
  const t = useTranslation();
  const [links, setLinks] = useState(props.links), [documents, setDocuments] = useState(props.documents);
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const operation = useRef({ key: '', id: '' }), busy = useRef(false);
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
  return <DocumentManagerTemplate links={links} documents={documents} revisions={props.revisions} canEdit={props.canEdit} pending={pending} error={error} notice={notice}
    onCreate={data => {
      const key = JSON.stringify([...data.entries()].map(([key, value]) => [key, typeof value === 'string' ? value : [value.name, value.size, value.lastModified]]));
      if (operation.current.key !== key) operation.current = { key, id: crypto.randomUUID() };
      data.set('operationId', operation.current.id);
      return mutate('create', data);
    }} onAttach={(id, revision) => { const data = new FormData(); data.set('documentId', id); data.set('revisionId', revision); return mutate('attach', data); }}
    onDetach={id => { const data = new FormData(); data.set('documentId', id); return mutate('detach', data); }} />;
}
