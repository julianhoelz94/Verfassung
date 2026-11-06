'use client';

import { useState, type FormEvent } from 'react';
import type { BibtexDecision, BibtexPreview, DocumentFolder, DocumentRecord } from '../../lib/document-api';
import { documentLibraryUi as m } from '../../lib/document-library-messages';
import { useTranslation } from '../components/TranslationProvider';
import { Alert, Button, Input, Select, TextArea } from '../components/ui';
import { Inline, Stack } from '../components/layout/Layout';
import styles from './DocumentLibrary.module.css';

export async function libraryCommand<T>(body: Record<string, unknown> | FormData): Promise<T> {
  const response = await fetch('/documents/command', body instanceof FormData ? { method: 'POST', body } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(response.status === 409 ? 'conflict' : 'document');
  return response.json() as Promise<T>;
}

type Props = { folders: DocumentFolder[]; folderId?: string; onImported: (documents: DocumentRecord[], folderId?: string) => void; onClose: () => void };

export function BibtexImport({ folders, folderId, onImported, onClose }: Props) {
  const t = useTranslation();
  const [destination, setDestination] = useState(folderId ?? '');
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState<BibtexPreview | null>(null);
  const [decisions, setDecisions] = useState<BibtexDecision[]>([]);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function invalidate() { setPreview(null); setDecisions([]); setOperationId(null); setError(null); }
  async function prepare(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      if (new TextEncoder().encode(content).length > 2 * 1024 * 1024) { setError(t(m.fileTooLarge)); return; }
      const next = await libraryCommand<BibtexPreview>({ command: 'bibtex-preview', content, folderId: destination || undefined });
      // A key collision is an explicit existing-record choice even if not also a DOI match.
      for (const entry of next.entries) {
        if (entry.conflictDocumentId && !entry.duplicateCandidates.some(document => document.id === entry.conflictDocumentId)) {
          const response = await fetch(`/documents/command?action=document&documentId=${encodeURIComponent(entry.conflictDocumentId)}`);
          if (!response.ok) throw new Error('document');
          entry.duplicateCandidates.push(await response.json() as DocumentRecord);
        }
      }
      setPreview(next);
      setDecisions(next.entries.map(entry => ({ index: entry.index, action: entry.conflictDocumentId ? 'skip' : 'create', citationKey: entry.citationKey })));
      setOperationId(crypto.randomUUID());
    } catch { setError(t(m.importFailed)); }
    finally { setBusy(false); }
  }
  function choose(index: number, patch: Partial<BibtexDecision>) {
    setDecisions(previous => previous.map(decision => decision.index === index ? { ...decision, ...patch } : decision));
    setOperationId(crypto.randomUUID());
  }
  async function commit() {
    if (!operationId) return;
    setBusy(true); setError(null);
    try {
      const result = await libraryCommand<{ documents: DocumentRecord[] }>({ command: 'bibtex-import', operationId, content, folderId: destination || undefined, decisions });
      onImported(result.documents, destination || undefined);
    } catch { setError(t(m.importFailed)); }
    finally { setBusy(false); }
  }
  const invalid = Boolean(preview?.entries.some(entry => {
    const decision = decisions.find(item => item.index === entry.index);
    return !decision || (decision.action === 'create' && !/^[A-Za-z][A-Za-z0-9_:-]{0,127}$/.test(decision.citationKey ?? '')) || (['link', 'update'].includes(decision.action) && !decision.documentId);
  }));

  return <section className={styles.importPanel} aria-label={t(m.import)}>
    <Stack gap="field">
      <Inline align="center"><h2>{t(m.import)}</h2><Button type="button" variant="ghost" onClick={onClose} disabled={busy}>{t(m.close)}</Button></Inline>
      <p>{t(m.importHelp)}</p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Stack as="form" onSubmit={prepare} gap="field">
        <Select label={t(m.importInto)} value={destination} onChange={event => { setDestination(event.target.value); invalidate(); }} disabled={busy}>
          <option value="">{t(m.all)}</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
        </Select>
        <Input label={t(m.bibtexFile)} type="file" accept=".bib,.bibtex,text/x-bibtex,application/x-bibtex,text/plain" disabled={busy} onChange={async event => {
          const file = event.target.files?.[0]; if (!file) return;
          invalidate();
          if (file.size > 2 * 1024 * 1024) { setError(t(m.fileTooLarge)); return; }
          try { setContent(await file.text()); } catch { setError(t(m.importFailed)); }
        }} />
        <TextArea label={t(m.bibtexContent)} value={content} onChange={event => { setContent(event.target.value); invalidate(); }} rows={8} required disabled={busy} />
        <Inline><Button variant="primary" disabled={busy || !content.trim()}>{busy ? t(m.loading) : t(m.preview)}</Button></Inline>
      </Stack>
      {preview ? <Stack gap="field">
        <p>{t(m.previewHelp)}</p>
        {preview.warnings.map((warning, index) => <Alert key={index}>{warning}</Alert>)}
        <ol className={styles.previewList}>{preview.entries.map(entry => {
          const decision = decisions.find(item => item.index === entry.index);
          if (!decision) return null;
          return <li key={entry.index}><Stack gap="field">
            <h3>{entry.title || entry.citationKey}</h3>
            {entry.conflictDocumentId ? <Alert>{t(m.conflict)}</Alert> : null}
            {entry.warnings.map((warning, index) => <p key={index} className={styles.muted}>{warning}</p>)}
            <Select label={`${t(m.preview)}: ${entry.title || entry.citationKey}`} value={decision.action} disabled={busy} onChange={event => {
              const action = event.target.value as BibtexDecision['action'];
              choose(entry.index, { action, documentId: undefined, expectedRevision: undefined, citationKey: action === 'create' ? entry.citationKey : undefined });
            }}>
              <option value="create">{t(m.create)}</option><option value="skip">{t(m.skip)}</option>
              {entry.duplicateCandidates.length ? <><option value="update">{t(m.update)}</option><option value="link">{t(m.link)}</option></> : null}
            </Select>
            {decision.action === 'create' ? <Input label={t(m.key)} value={decision.citationKey ?? ''} pattern="[A-Za-z][A-Za-z0-9_:\-]{0,127}" required disabled={busy} onChange={event => choose(entry.index, { citationKey: event.target.value })} /> : null}
            {decision.action === 'link' || decision.action === 'update' ? <Select label={t(m.match)} value={decision.documentId ?? ''} disabled={busy} required onChange={event => {
              const matched = entry.duplicateCandidates.find(document => document.id === event.target.value);
              choose(entry.index, { documentId: matched?.id, expectedRevision: matched?.currentRevision });
            }}><option value="">{t(m.chooseMatch)}</option>{entry.duplicateCandidates.map(document => <option key={document.id} value={document.id}>{document.revision.title} ({document.citationKey})</option>)}</Select> : null}
          </Stack></li>;
        })}</ol>
        <Inline><Button type="button" variant="primary" onClick={commit} disabled={busy || invalid || preview.entries.length === 0}>{busy ? t(m.loading) : t(m.confirmImport)}</Button></Inline>
      </Stack> : null}
    </Stack>
  </section>;
}
