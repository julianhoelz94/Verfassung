'use client';

import { useEffect, useRef, useState } from 'react';
import type { DocumentLink } from '../../../lib/document-api';
import type { LifecycleScope, LifecycleUnit, LifecycleVersion } from '../../../lib/lifecycle-workspace';
import { lifecycleDate, lifecycleEventLabels } from '../../../lib/lifecycle-workspace';
import { lifecycleWorkspaceUi as copy } from '../../../lib/lifecycle-workspace-messages';
import { ui } from '../../../lib/messages';
import { fetchWithTimeout } from '../../../lib/fetch-with-timeout';
import { useLocale, useTranslation } from '../../components/TranslationProvider';
import { Alert, Button, Input, Select, TextArea } from '../../components/ui';
import { Grid, Inline, Stack } from '../../components/layout/Layout';
import { SettingInfo } from '../../components/SettingInfo';
import { StagedDocumentPicker } from '../../components/documents/StagedDocumentPicker';
import { StagedRecordForm } from './StagedRecordForm';
import { LifecyclePassagePicker } from './LifecyclePassagePicker';
import styles from './LifecycleWorkspace.module.css';

export type LifecycleFormContext = { constitutionId: string; code: string; jurisdictionId?: string; canCreate: boolean };
type Props = LifecycleFormContext & { scope: LifecycleScope; allowed: string[]; lastDate?: string; versions: LifecycleVersion[]; initialVersionId?: string; initialUnits: LifecycleUnit[]; action: (form: FormData) => Promise<string> };

export function LifecycleEventForm({ scope, allowed, lastDate, versions, initialVersionId, initialUnits, action, ...context }: Props) {
  const t = useTranslation(), locale = useLocale(), form = useRef<HTMLFormElement>(null), confirmed = useRef(false), generation = useRef(0);
  const [review, setReview] = useState<FormData | null>(null), [documents, setDocuments] = useState<DocumentLink[]>([]), [documentsPending, setDocumentsPending] = useState(false);
  const [version, setVersion] = useState(initialVersionId ?? ''), [units, setUnits] = useState(initialUnits), [selected, setSelected] = useState<string[]>([]);
  const [versionRequest, setVersionRequest] = useState(''), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const whole = scope === 'whole', prefix = whole ? 'event' : 'provision-event';
  async function loadVersion(next: string) {
    const attempt = ++generation.current; setLoading(true); setError(''); setVersionRequest('');
    try {
      const parameters = new URLSearchParams({ constitutionId: context.constitutionId, versionId: next, code: context.code, ...(context.jurisdictionId ? { jurisdictionId: context.jurisdictionId } : {}) });
      const response = await fetchWithTimeout(`/editor/lifecycle/units?${parameters}`);
      if (!response.ok) throw new Error('units');
      const result = await response.json() as { units: LifecycleUnit[] };
      if (generation.current === attempt) { setVersion(next); setUnits(result.units); setSelected([]); }
    } catch { if (generation.current === attempt) setError(t(copy.versionFailed)); }
    finally { if (generation.current === attempt) setLoading(false); }
  }
  function beforeSubmit(element: HTMLFormElement) {
    if (loading || documentsPending) return false;
    if (!whole && !selected.length) { setError(t(copy.noneSelected)); return false; }
    if (confirmed.current) { confirmed.current = false; setReview(null); return true; }
    setReview(new FormData(element)); return false;
  }
  if (!whole && !initialVersionId) return <Alert>{t(copy.noVersion)}</Alert>;
  if (whole && !allowed.length) return <Alert>{t(ui.editor.lifecycle.constitutionid.page.thisConstitutionHasBeenRepealed)}</Alert>;
  return <>
    <StagedRecordForm action={action} elementRef={form} beforeSubmit={beforeSubmit} className={styles.eventForm}>
      <input type="hidden" name="constitutionId" value={context.constitutionId} /><input type="hidden" name="code" value={context.code.toLowerCase()} /><input type="hidden" name="jurisdictionId" value={context.jurisdictionId ?? ''} />
      <div className={styles.formBody}>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {!whole ? <Stack gap="field"><Select id="scope-version" name="sourceVersionId" label={t(copy.sourceVersion)} value={version} disabled={loading} onChange={event => { if (selected.length) setVersionRequest(event.target.value); else void loadVersion(event.target.value); }}><>{versions.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</></Select>
          {loading ? <p role="status">{t(copy.loading)}</p> : null}
          {selected.map(id => <input type="hidden" name="logicalUnitIds" value={id} key={id} />)}
          <LifecyclePassagePicker disabled={loading} units={units} selected={selected} onChange={setSelected} />
        </Stack> : null}
        <Stack as="section" gap="field"><h2 className={styles.sectionTitle}><span>2</span>{t(copy.eventDate)}</h2>
          <Select id={`${prefix}-type`} name="eventType" label={t(copy.event)} defaultValue="" required info={{ description: t(copy.eventHelp), changeability: 'once', changeNote: t(copy.fixedEvent) }}><option value="">{t(copy.chooseEvent)}</option>{allowed.map(kind => <option value={kind} key={kind}>{t(lifecycleEventLabels[kind])}</option>)}</Select>
          <Grid columns={2} variant="form"><Input id={`${prefix}-date`} name="eventDate" label={t(copy.date)} type="date" min={whole ? lastDate : undefined} required info={{ description: t(whole ? copy.dateHelp : copy.provisionDateHelp), changeability: 'once', changeNote: t(copy.fixedEvent) }} />
            {whole ? <Select id="event-certainty" name="dateCertainty" label={t(copy.certainty)} defaultValue="exact" info={{ description: t(copy.certaintyHelp), changeability: 'once' }}><option value="exact">{t(ui.editor.lifecycle.constitutionid.page.exactDate)}</option><option value="approximate">{t(ui.editor.lifecycle.constitutionid.page.approximateDate)}</option></Select> : null}</Grid>
          <details><summary>{t(copy.unknown)}</summary><p className={styles.muted}>{t(whole ? copy.dateHelp : copy.provisionDateHelp)}</p></details>
        </Stack>
        <Stack as="section" gap="field"><div className={styles.heading}><h2 className={styles.sectionTitle}><span>3</span>{t(copy.evidenceNote)}</h2><SettingInfo label={t(copy.documents)} description={t(copy.evidenceHelp)} changeability="later" /></div>
          <StagedDocumentPicker name="stagedDocuments" heading={t(copy.documents)} headingLevel="h3" canCreate={context.canCreate} onLinksChange={setDocuments} onPendingChange={setDocumentsPending} />
          <TextArea id={`${prefix}-note`} name="note" label={<>{t(copy.note)} <span className={styles.muted}>{t(copy.optional)}</span></>} rows={3} maxLength={10000} info={{ description: t(copy.noteHelp), changeability: 'later' }} />
        </Stack>
      </div>
      <div className={styles.formFooter}><p className={styles.muted}>{t(copy.reviewHelp)}</p><Button type="submit" variant="primary" disabled={loading || documentsPending}>{t(copy.review)} <span aria-hidden="true">→</span></Button></div>
    </StagedRecordForm>
    {review ? <LifecycleReview data={review} documents={documents} scope={scope} versionLabel={versions.find(item => item.id === version)?.label} units={units.filter(unit => selected.includes(unit.id))} onClose={() => setReview(null)} onSave={() => { confirmed.current = true; form.current?.requestSubmit(); }} locale={locale} /> : null}
    {versionRequest ? <VersionConfirmation onClose={() => setVersionRequest('')} onConfirm={() => void loadVersion(versionRequest)} /> : null}
  </>;
}

function LifecycleReview({ data, documents, units, scope, versionLabel, locale, onClose, onSave }: { data: FormData; documents: DocumentLink[]; units: LifecycleUnit[]; scope: LifecycleScope; versionLabel?: string; locale: string; onClose: () => void; onSave: () => void }) {
  const t = useTranslation(), dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="lifecycle-review-title" onCancel={onClose}>
    <div className={styles.dialogHeading}><h2 id="lifecycle-review-title">{t(copy.reviewTitle)}</h2><Button type="button" variant="ghost" onClick={onClose}>{t(copy.close)}</Button></div>
    <Stack className={styles.dialogBody} gap="field"><dl className={styles.reviewList}>
      <dt>{t(copy.scope)}</dt><dd>{t(scope === 'whole' ? copy.whole : copy.passages)}</dd>
      {scope === 'passages' ? <><dt>{t(copy.sourceVersion)}</dt><dd>{versionLabel}</dd><dt>{t(copy.selected)}</dt><dd>{units.map(unit => <p key={unit.id}>{unit.path}</p>)}</dd></> : null}
      <dt>{t(copy.event)}</dt><dd>{t(lifecycleEventLabels[String(data.get('eventType'))])}</dd><dt>{t(copy.date)}</dt><dd>{lifecycleDate(String(data.get('eventDate')), locale, data.get('dateCertainty') === 'approximate')}</dd>
      <dt>{t(copy.documentCount)}</dt><dd>{documents.length ? documents.map(link => <p key={link.documentId}>{link.document.revision.title} · {t({ en: 'Revision', de: 'Revision' })} {link.document.revision.revision}</p>) : '0'}</dd>
      <dt>{t(copy.note)}</dt><dd>{String(data.get('note') || '—')}</dd>
    </dl><Alert>{t(copy.irreversible)}</Alert></Stack>
    <div className={styles.dialogActions}><Inline><Button type="button" onClick={onClose}>{t(copy.back)}</Button><Button type="button" variant="primary" onClick={onSave}>{t(copy.save)}</Button></Inline></div>
  </dialog>;
}

function VersionConfirmation({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  const t = useTranslation(), dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="lifecycle-version-title" onCancel={onClose}><div className={styles.dialogBody}><h2 id="lifecycle-version-title">{t(copy.changeVersion)}</h2><p>{t(copy.changeVersionHelp)}</p></div><div className={styles.dialogActions}><Inline><Button type="button" onClick={onClose}>{t(copy.cancel)}</Button><Button type="button" variant="primary" onClick={onConfirm}>{t(copy.changeVersion)}</Button></Inline></div></dialog>;
}
