'use client';

import { useId, useState, type ReactNode } from 'react';
import type { DocumentLink, DocumentRecord, DocumentRevision, DocumentFolder } from '../../../lib/document-api';
import { useTranslation } from '../TranslationProvider';
import { Alert, Button } from '../ui';
import { Inline, Stack } from '../layout/Layout';
import { DocumentLibraryPicker } from './DocumentLibraryPicker';
import { DocumentUploadForm } from './DocumentUploadForm';
import styles from './DocumentAttachmentTemplate.module.css';

export type DocumentAttachmentTemplateProps = {
  heading?: string;
  headingLevel?: 'h2' | 'h3' | 'h4';
  links: DocumentLink[];
  documents: DocumentRecord[];
  revisions: Record<string, DocumentRevision[]>;
  canEdit: boolean;
  canCreate?: boolean;
  folders?: DocumentFolder[];
  pending: boolean;
  error?: string;
  notice?: string;
  documentTotal?: number;
  documentOffset?: number;
  searchPending?: boolean;
  revisionPending?: boolean;
  onSearch?: (query: string, offset: number, folderId?: string) => Promise<boolean>;
  onSelect?: (documentId: string) => Promise<void>;
  onInspect?: (document: DocumentRecord) => void;
  renderAttachmentContext?: (link: DocumentLink) => ReactNode;
  contextFields?: (mode: 'upload' | 'select') => ReactNode;
  onCreate: (data: FormData) => Promise<boolean>;
  onAttach: (id: string, revision: string) => Promise<boolean>;
  onDetach: (id: string) => Promise<boolean>;
};

/** Shared editor presentation; route adapters retain authorization and target ownership. */
export function DocumentAttachmentTemplate({ heading, headingLevel: Heading = 'h2', links, documents, revisions, canEdit, canCreate = canEdit, folders = [], pending, error, notice, documentTotal, documentOffset = 0, searchPending, revisionPending, onSearch, onSelect, onInspect, onCreate, onAttach, onDetach, contextFields, renderAttachmentContext }: DocumentAttachmentTemplateProps) {
  const t = useTranslation(), copy = (en: string, de: string) => t({ en, de });
  const id = useId();
  const [opened,setOpened]=useState({new:false,existing:false});
  const [task, setTask] = useState<'new' | 'existing' | null>(null);
  function renderLinks() {
    return links.length ? <ul className={styles.links}>{links.map(link => <li key={link.documentId}>
      <div><a href={`/documents/${link.documentId}?revision=${link.document.revision.revision}`} target="_blank" rel="noreferrer" onClick={event=>{if(onInspect){event.preventDefault();onInspect(link.document);}}}>{link.document.revision.title}</a>
        <span className={styles.muted}>{copy('Revision', 'Revision')} {link.document.revision.revision}{link.document.revision.fileName ? ` · ${link.document.revision.fileName}` : ''}</span>{renderAttachmentContext?.(link)}</div>
      {canEdit ? <Button type="button" size="sm" variant="ghost" disabled={pending} aria-label={`${copy('Detach', 'Verknüpfung lösen')}: ${link.document.revision.title}`} onClick={() => void onDetach(link.documentId)}>{copy('Detach', 'Verknüpfung lösen')}</Button> : null}
    </li>)}</ul> : <p className={styles.muted}>{copy('No documents linked yet.', 'Noch keine Dokumente verknüpft.')}</p>;
  }
  function renderNew() {
    return <div id={`${id}-new`} hidden={task !== 'new'}>{opened.new ? <DocumentUploadForm pending={pending} onCreate={onCreate} contextFields={contextFields?.('upload')} onCancel={() => setTask(null)} /> : null}</div>;
  }

  function renderExisting() {
    return <div id={`${id}-existing`} hidden={task !== 'existing'}>{opened.existing ? <DocumentLibraryPicker documents={documents} revisions={revisions} folders={folders} attachedIds={links.map(link => link.documentId)} pending={pending} searchPending={searchPending} revisionPending={revisionPending} documentTotal={documentTotal} documentOffset={documentOffset} onSearch={onSearch} onSelect={onSelect} onAttach={onAttach} onCancel={() => setTask(null)} contextFields={contextFields?.('select')} /> : null}</div>;
  }
  return <Stack as="section" gap="field" aria-labelledby={`${id}-title`} className={styles.manager}>
    <Heading id={`${id}-title`}>{heading ?? copy('Documents', 'Dokumente')}</Heading>
    {error ? <Alert tone="error">{error}</Alert> : null}
    {notice ? <p role="status" className={styles.muted}>{notice}</p> : null}
    {renderLinks()}
    {canEdit ? <>
      <Inline>{canCreate ? <Button type="button" variant={task === 'new' ? 'primary' : 'secondary'} size="sm" disabled={pending} aria-pressed={task === 'new'} aria-expanded={task === 'new'} aria-controls={`${id}-new`} onClick={() => {setOpened(current=>({...current,new:true}));setTask(task === 'new' ? null : 'new');}}>{copy('Upload new document', 'Neues Dokument hochladen')}</Button> : null}
        <Button type="button" variant={task === 'existing' ? 'primary' : 'secondary'} size="sm" disabled={pending} aria-pressed={task === 'existing'} aria-expanded={task === 'existing'} aria-controls={`${id}-existing`} onClick={() => {setOpened(current=>({...current,existing:true}));setTask(task === 'existing' ? null : 'existing');}}>{copy('Choose existing document', 'Vorhandenes Dokument auswählen')}</Button></Inline>
    {renderNew()}
    {renderExisting()}
    </> : null}
  </Stack>;
}
