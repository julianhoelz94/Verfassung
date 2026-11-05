'use client';

import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { DocumentLink, DocumentRecord, DocumentRevision } from '@gateway/lib/document-api';
import { useTranslation } from '@gateway/app/components/TranslationProvider';
import { Alert, Button, Input, Select, TextArea } from '@gateway/app/components/ui';
import { Inline, Stack } from '@gateway/app/components/layout/Layout';
import styles from './DocumentManagerTemplate.module.css';

export type DocumentManagerTemplateProps = {
  links: DocumentLink[];
  documents: DocumentRecord[];
  revisions: Record<string, DocumentRevision[]>;
  canEdit: boolean;
  pending: boolean;
  error?: string;
  notice?: string;
  onInspect?: (document: DocumentRecord) => void;
  onCreate: (data: FormData) => Promise<boolean>;
  onAttach: (id: string, revision: string) => Promise<boolean>;
  onDetach: (id: string) => Promise<boolean>;
};

/** Shared editor presentation; route adapters retain authorization and target ownership. */
export function DocumentManagerTemplate({ links, documents, revisions, canEdit, pending, error, notice, onInspect, onCreate, onAttach, onDetach }: DocumentManagerTemplateProps) {
  const t = useTranslation(), copy = (en: string, de: string) => t({ en, de });
  const id = useId();
  const [task, setTask] = useState<'new' | 'existing' | null>(null);
  const [title, setTitle] = useState(''), [description, setDescription] = useState(''), [sourceUrl, setSourceUrl] = useState('');
  const [file, setFile] = useState<File | null>(null), [fileError, setFileError] = useState('');
  const [query, setQuery] = useState(''), [selected, setSelected] = useState(''), [revision, setRevision] = useState('');
  const available = documents.filter(document => document.status === 'active' && !links.some(link => link.documentId === document.id));
  const selectedDocument = available.find(document => document.id === selected);
  const options = selectedDocument ? revisions[selectedDocument.id] ?? [selectedDocument.revision] : [];
  const selectedRevision = revision || selectedDocument?.revision.id || '';
  async function createFromForm(form:HTMLFormElement) {
    if(pending||!form.reportValidity())return;
    if(file&&file.size>20*1024*1024){setFileError(copy('Choose a file up to 20 MB.','Wähle eine Datei mit höchstens 20 MB.'));return;}
    if(!file&&!sourceUrl.trim()){setFileError(copy('Choose a file or enter its source URL.','Wähle eine Datei oder gib ihre Quell-URL ein.'));return;}
    setFileError('');
    const data=new FormData();data.set('title',title);data.set('description',description);data.set('sourceUrl',sourceUrl);if(file)data.set('file',file);
    if(await onCreate(data)){form.reset();setTitle('');setDescription('');setSourceUrl('');setFile(null);setTask(null);}
  }
  async function attachExisting(){if(!pending&&selected&&selectedRevision&&await onAttach(selected,selectedRevision)){setSelected('');setRevision('');setTask(null);}}
  return <Stack as="section" gap="field" aria-labelledby={`${id}-title`} className={styles.manager}>
    <h2 id={`${id}-title`}>{copy('Documents', 'Dokumente')}</h2>
    {error || fileError ? <Alert tone="error">{fileError || error}</Alert> : null}
    {notice ? <p role="status" className={styles.muted}>{notice}</p> : null}
    {links.length ? <ul className={styles.links}>{links.map(link => <li key={link.documentId}>
      <div><a href={`/documents/${link.documentId}?revision=${link.document.revision.revision}`} target="_blank" rel="noreferrer" onClick={event=>{if(onInspect){event.preventDefault();onInspect(link.document);}}}>{link.document.revision.title}</a>
        <span className={styles.muted}>{copy('Revision', 'Revision')} {link.document.revision.revision}{link.document.revision.fileName ? ` · ${link.document.revision.fileName}` : ''}</span></div>
      <Inline gap="related"><a href={`/editor/documents/${link.documentId}`} target="_blank" rel="noreferrer" onClick={event=>{if(onInspect){event.preventDefault();onInspect(link.document);}}}>{copy('History', 'Verlauf')}</a>
        {canEdit ? <Button type="button" size="sm" variant="ghost" disabled={pending} aria-label={`${copy('Detach', 'Verknüpfung lösen')}: ${link.document.revision.title}`} onClick={() => void onDetach(link.documentId)}>{copy('Detach', 'Verknüpfung lösen')}</Button> : null}</Inline>
    </li>)}</ul> : <p className={styles.muted}>{copy('No documents linked yet.', 'Noch keine Dokumente verknüpft.')}</p>}
    {canEdit ? <>
      <Inline><Button type="button" variant="secondary" size="sm" disabled={pending} aria-expanded={task === 'new'} aria-controls={`${id}-new`} onClick={() => setTask(task === 'new' ? null : 'new')}>{copy('Upload new document', 'Neues Dokument hochladen')}</Button>
        <Button type="button" variant="secondary" size="sm" disabled={pending} aria-expanded={task === 'existing'} aria-controls={`${id}-existing`} onClick={() => setTask(task === 'existing' ? null : 'existing')}>{copy('Choose existing document', 'Vorhandenes Dokument auswählen')}</Button></Inline>
      <Stack as="form" id={`${id}-new`} hidden={task !== 'new'} className={styles.form} onSubmit={(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();void createFromForm(event.currentTarget);}} onKeyDown={(event:KeyboardEvent<HTMLFormElement>)=>{if(event.key==='Enter'&&event.target instanceof HTMLInputElement&&event.target.type!=='file'){event.preventDefault();void createFromForm(event.currentTarget);}}}>
        <Input label={copy('File', 'Datei')} type="file" accept="application/pdf,text/plain" disabled={pending} help={copy('PDF or text, up to 20 MB. A source URL can be used without a file.', 'PDF oder Text, bis zu 20 MB. Eine Quell-URL kann auch ohne Datei verwendet werden.')} onChange={event => { const picked = event.target.files?.[0] ?? null; setFile(picked); setFileError(''); if (!title && picked) setTitle(picked.name.replace(/\.[^.]+$/, '')); }} />
        <Input label={copy('Title', 'Titel')} required maxLength={500} value={title} disabled={pending} onChange={event => setTitle(event.target.value)} />
        <Input label={copy('Source URL', 'Quell-URL')} type="url" value={sourceUrl} disabled={pending} onChange={event => setSourceUrl(event.target.value)} />
        <TextArea label={copy('Description', 'Beschreibung')} value={description} rows={2} disabled={pending} onChange={event => setDescription(event.target.value)} />
        <p className={styles.muted}>{copy('The document is added to the central library and linked here in the same step.', 'Das Dokument wird im selben Schritt in die zentrale Bibliothek aufgenommen und hier verknüpft.')}</p>
        <Inline><Button type="button" variant="primary" disabled={pending} onClick={event=>{const form=event.currentTarget.form;if(form)void createFromForm(form);}}>{pending ? copy('Adding…', 'Wird hinzugefügt…') : file ? copy('Upload and attach', 'Hochladen und verknüpfen') : copy('Create and attach', 'Anlegen und verknüpfen')}</Button><Button type="button" variant="ghost" disabled={pending} onClick={() => setTask(null)}>{copy('Cancel', 'Abbrechen')}</Button></Inline>
      </Stack>
      <Stack as="form" id={`${id}-existing`} hidden={task !== 'existing'} className={styles.form} onSubmit={(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();void attachExisting();}} onKeyDown={(event:KeyboardEvent<HTMLFormElement>)=>{if(event.key==='Enter'&&event.target instanceof HTMLInputElement){event.preventDefault();void attachExisting();}}}>
        <Input label={copy('Search documents', 'Dokumente suchen')} type="search" value={query} onChange={event => setQuery(event.target.value)} />
        <Select label={copy('Document', 'Dokument')} required value={selected} disabled={pending} onChange={event => { setSelected(event.target.value); setRevision(''); }}><option value="">{copy('Choose a document…', 'Dokument auswählen…')}</option>{available.filter(document => document.revision.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(document => <option key={document.id} value={document.id}>{document.revision.title}</option>)}</Select>
        {selectedDocument ? <Select label={copy('Revision to cite', 'Zu zitierende Revision')} value={selectedRevision} disabled={pending} onChange={event => setRevision(event.target.value)}>{options.map(item => <option key={item.id} value={item.id}>{copy('Revision', 'Revision')} {item.revision}</option>)}</Select> : null}
        <Inline><Button type="button" variant="primary" disabled={pending || !selectedDocument || !selectedRevision} onClick={()=>void attachExisting()}>{copy('Attach document', 'Dokument verknüpfen')}</Button><Button type="button" variant="ghost" disabled={pending} onClick={() => setTask(null)}>{copy('Cancel', 'Abbrechen')}</Button></Inline>
      </Stack>
    </> : null}
  </Stack>;
}
