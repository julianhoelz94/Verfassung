'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useHydrated } from '../../lib/use-hydrated';
import { Info, Upload } from 'lucide-react';
import { Alert, Button, TextArea } from '../components/ui';
import { WorkContextLayout } from '../components/layout/WorkCollection';
import { useTranslation } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import { reviewUi } from '../../lib/ui-review-messages';
import { importWorkspaceUi as m } from '../../lib/import-workspace-messages';
import { createImportAction, createSetupProposalAction } from '../admin/import/actions';
import styles from './import-workspace.module.css';

export function ImportUpload({ mode, onMode, context, contextId, contextShown, initialError }: { mode: string; onMode: (mode: string) => void; context: ReactNode; contextId: string; contextShown: boolean; initialError?: string }) {
  const t = useTranslation();
  return <>
    <div className={styles.intro}><h2>{t(m.prepare)}</h2><p>{t(m.prepareHint)}</p></div>
    <WorkContextLayout creation context={context} contextId={contextId} shown={contextShown} label={t(m.nextLabel)}>
      <fieldset className={styles.modeChoices}><legend>{t(m.what)}</legend>{['existing', 'new'].map(value => <label key={value} className={styles.modeChoice} data-selected={mode === value}><input type="radio" name="import-kind" checked={mode === value} onChange={() => onMode(value)} /><span><strong>{t(value === 'existing' ? m.existing : m.new)}</strong><small>{t(value === 'existing' ? m.versionHint : m.structureHint)}</small></span></label>)}</fieldset>
      {['existing', 'new'].map(value => <div key={value} hidden={mode !== value}><ImportUploadForm mode={value} initialError={value === mode ? initialError : undefined} /></div>)}
    </WorkContextLayout>
  </>;
}
export function ImportUploadContext({ mode }: { mode: string }) {
  const t = useTranslation();
  return <section className={styles.guidance}><div className={styles.guidanceHeading}><Info size={16} aria-hidden="true" /><h3>{t(m.next)}</h3></div><ol className={styles.nextSteps}>
    <li><strong>{t(m.chooseFile)}</strong><span>{t(m.jsonHint)}</span></li>
    <li><strong>{t(m.reviewFirst)}</strong><span>{t(mode === 'new' ? m.confirmStructure : m.compare)}</span></li>
    <li><strong>{t(m.approve)}</strong><span>{t(m.noPublish)}</span></li>
  </ol><p className={styles.guidanceNote}>{t(m.retained)}</p><Link href="/admin/constitutions">{t(reviewUi.backToConstitutions)}</Link></section>;
}
function stagingError(error: string) {
  return error === 'forbidden' ? ui.admin.import.page.editorRightsRequiredForStaging : error === 'json' ? ui.admin.import.page.thatFileIsNotValidJson : error === 'invalid' ? ui.admin.import.page.theJsonIsMissingRequiredImportFields : ui.admin.import.page.theImportCouldNotBeStarted;
}
function ImportUploadForm({ mode, initialError }: { mode: string; initialError?: string }) {
  const ready = useHydrated();
  const t = useTranslation(), input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null), [json, setJson] = useState(''), [error, setError] = useState(initialError ?? '');
  const [pending, setPending] = useState(false), [dragging, setDragging] = useState(false), [expanded, setExpanded] = useState(Boolean(initialError));
  const proposal = mode === 'new', field = proposal ? 'proposalFile' : 'file', jsonField = proposal ? 'proposal' : 'payload', id = field;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!ready || pending) return;
    const data = new FormData(event.currentTarget); if (file) data.set(field, file);
    setPending(true); setError('');
    try {
      const destination = await (proposal ? createSetupProposalAction : createImportAction)(data);
      const failure = new URL(destination, window.location.origin).searchParams.get('error');
      if (failure) { setError(failure); setPending(false); if (!file) setExpanded(true); }
      else window.location.assign(destination);
    } catch { setError('unavailable'); setPending(false); }
  }
  return <form id={proposal ? 'structure' : 'upload'} className={styles.uploadForm} onSubmit={submit} aria-busy={!ready || pending}>
    <fieldset disabled={!ready || pending} className={styles.formFields}>
      <div className={styles.fileDrop} data-dragging={dragging} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => {
        event.preventDefault(); setDragging(false); if (!ready || pending) return;
        const dropped = event.dataTransfer.files[0]; if (!dropped) return;
        setFile(dropped); setError('');
        if (input.current) { try { input.current.files = event.dataTransfer.files; } catch { /* FormData uses the retained File object. */ } }
      }}>
        <Upload size={22} aria-hidden="true" /><h3><label htmlFor={id}>{t(proposal ? m.proposalFile : m.file)}</label></h3><p>{t(m.drop)}</p>
        <input ref={input} id={id} name={field} type="file" accept=".json,application/json" onChange={event => { setFile(event.target.files?.[0] ?? null); setError(''); }} />
      </div>
      {file ? <div className={styles.selectedFile} role="status"><span>{file.name}</span><Button type="button" size="sm" variant="ghost" onClick={() => { setFile(null); if (input.current) input.current.value = ''; }}>{t(m.remove)}</Button></div> : null}
      <details className={styles.jsonDetails} open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary>{t(reviewUi.pasteJson)}</summary><TextArea id={jsonField} label={t(proposal ? ui.attrs.adminImportPageTextAreaLabelSetup : ui.attrs.adminImportPageTextAreaLabelImport)} name={jsonField} rows={10} spellCheck={false} value={json} onChange={event => { setJson(event.target.value); setError(''); }} />{file ? <p>{t(m.fileWins)}</p> : null}</details>
      {error ? <Alert tone="error">{t(stagingError(error))}</Alert> : null}
      <div className={styles.formFooter}><Button variant="primary">{t(proposal ? reviewUi.prepareStructure : ui.admin.import.page.stageForReview)}</Button><p>{t(m.private)}</p></div>
    </fieldset>
  </form>;
}
