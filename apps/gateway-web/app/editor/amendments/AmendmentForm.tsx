'use client';

import { fetchWithTimeout } from '../../../lib/fetch-with-timeout';

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { T, useTranslation, useLocale } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { changeTypeMessage, statusMessage } from '../../../lib/ui-labels';
import type { Amendment, ArticleSummary, VersionSummary } from '../../../lib/api';
import type { ReaderOwner } from '../../../lib/reader-links';
import { Alert, Badge, Button, Input, Select, TextArea } from '../../components/ui';
import { AmendmentChangesTable, type ChangeRow } from './AmendmentChangesTable';
import { amendmentErrorMessage } from '../../../lib/amendment-messages';
import { suggestChangesAction } from './actions';
import type { DiffReviewState, ReviewCandidate } from '../../../lib/diff-review';
import { decisionResolved } from '../../../lib/diff-review';
import { DiffReviewQueue } from '../DiffReviewQueue';
import { Stack, Inline, Grid } from '../../components/layout/Layout';
import { PageChromeSurface, PageMenuBar, PageMenuFrame } from '../../components/layout/PageChrome';
import { usePageChromeMetrics } from '../../components/layout/usePageChromeMetrics';
import chrome from '../../components/layout/PageChrome.module.css';
import styles from './amendment-workspace.module.css';

type View = 'passages' | 'review' | 'details' | 'documents' | 'history' | 'publication';
const views: View[] = ['passages', 'review', 'details', 'documents', 'history', 'publication'];

type AmendmentFormProps = {
  amendmentId: string; constitutionId: string; amendment: Amendment | null;
  versions: VersionSummary[]; articlesByVersion: Record<string, string[]>; unitTreesByVersion: Record<string, ArticleSummary[]>;
  readerOwners?: Record<string, ReaderOwner>; latestVersionId?: string | null;
  canSave: boolean; canWithdraw: boolean; canPublish?: boolean; readOnly: boolean;
  contentAvailable?: boolean; diffReview?: DiffReviewState | null; canReviewDiff?: boolean; canAcknowledgeDiff?: boolean;
  documentsPanel?: ReactNode; historyPanel?: ReactNode; quoteReviewPanel?: ReactNode;
};

function initialRows(amendment: Amendment | null): ChangeRow[] {
  return (amendment?.changes ?? []).map(change => ({ articleNumber: change.articleNumber ?? '', changeType: change.changeType, note: change.note ?? '', beforeRef: change.beforeRef ?? null,
    afterRef: change.afterRef ?? (change.pendingAfterLogicalId ? { logicalId: change.pendingAfterLogicalId } : null), linkReviewReason: change.linkReviewReason ?? '', legacyLinkUnresolved: change.legacyLinkUnresolved ?? false }));
}

export function AmendmentForm({ amendmentId, constitutionId, amendment, versions, articlesByVersion, unitTreesByVersion, readerOwners, latestVersionId,
  canSave, canWithdraw, canPublish = false, readOnly, contentAvailable = true, diffReview, canReviewDiff = false, canAcknowledgeDiff = false,
  documentsPanel, historyPanel, quoteReviewPanel }: AmendmentFormProps) {
  const t = useTranslation(), copy = (en: string, de: string) => t({ en, de });
  const [view, setView] = useState<View>(amendment ? 'passages' : 'details');
  const [sourceVersionId, setSourceVersionId] = useState(amendment?.sourceVersionId ?? '');
  const [targetVersionId, setTargetVersionId] = useState(amendment?.targetVersionId ?? '');
  const [pairSource, setPairSource] = useState(sourceVersionId), [pairTarget, setPairTarget] = useState(targetVersionId);
  const [changeRows, setChangeRows] = useState<ChangeRow[]>(() => initialRows(amendment));
  const [suggestError, setSuggestError] = useState(''), [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false), [review, setReview] = useState(diffReview);
  const [saveError,setSaveError]=useState(''),[savePending,setSavePending]=useState(false);
  const locale=useLocale(), saving=useRef(false);
  const submitting = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null), form = useRef<HTMLFormElement>(null), root = useRef<HTMLDivElement>(null), menu = useRef<HTMLDivElement>(null), navigation = useRef<HTMLElement>(null);
  usePageChromeMetrics(root, menu, navigation);
  useEffect(() => {
    function restore() { const value = new URL(window.location.href).searchParams.get('view'); if (views.includes(value as View)) setView(value as View); else setView(amendmentId==='new' ? 'details' : 'passages'); }
    queueMicrotask(restore); window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [amendmentId]);
  useEffect(() => {
    function guard(event: BeforeUnloadEvent) { if (dirty && !submitting.current) { event.preventDefault(); event.returnValue=''; } }
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload',guard);
  }, [dirty]);
  function go(next: View) { setView(next); const url = new URL(window.location.href); url.searchParams.set('view', next); window.history.pushState(null, '', url); }
  const labels: Record<View,string> = { passages: copy('Affected passages','Betroffene Passagen'), review: copy('Review','Prüfung'), details: copy('Details','Angaben'), documents: copy('Documents','Dokumente'), history: copy('History','Verlauf'), publication: copy('Publication','Veröffentlichung') };
  const versionLabel = (id: string) => { const version = versions.find(item => item.id===id); return version ? `${version.versionLabel}${version.listing==='staff' ? copy(' · staff',' · intern') : ''}` : id || copy('Not selected','Nicht gewählt'); };
  const articleNumbers = useMemo(() => articlesByVersion[targetVersionId || latestVersionId || ''] ?? [], [articlesByVersion,targetVersionId,latestVersionId]);
  const pairChanged = sourceVersionId !== (amendment?.sourceVersionId ?? '') || targetVersionId !== (amendment?.targetVersionId ?? '');
  const unresolved = review?.candidates.filter(candidate => !decisionResolved(candidate, review.decisions.find(decision => decision.key===candidate.key))).length ?? 0;
  function suggest() {
    if (!sourceVersionId || !targetVersionId || sourceVersionId===targetVersionId) { setSuggestError(copy('Choose two different constitution versions first.','Wähle zuerst zwei unterschiedliche Verfassungsfassungen.')); return; }
    setSuggestError(''); startTransition(async () => {
      try {
        const result = await suggestChangesAction(sourceVersionId,targetVersionId);
        if ('error' in result) { setSuggestError(result.error); return; }
        const suggested: ChangeRow[] = result.changes.map(change => ({ articleNumber: change.articleNumber ?? '', changeType: change.changeType, note: change.note ?? '', beforeRef: change.beforeRef ?? null,
          afterRef: change.afterRef ?? (change.pendingAfterLogicalId ? { logicalId: change.pendingAfterLogicalId } : null), linkReviewReason:'' }));
        const identity = (row: ChangeRow) => JSON.stringify([row.changeType,row.beforeRef?.versionId,row.beforeRef?.occurrenceId ?? row.beforeRef?.logicalId,row.afterRef?.versionId,row.afterRef?.occurrenceId ?? row.afterRef?.logicalId]);
        setChangeRows(current => { const keys=new Set(current.map(identity)); return [...current, ...suggested.filter(row => !keys.has(identity(row)))]; });
        setDirty(true); go('passages');
      } catch { setSuggestError(copy('Differences could not be loaded. Your draft is still here.','Unterschiede konnten nicht geladen werden. Dein Entwurf bleibt erhalten.')); }
    });
  }
  function addCandidateRow(candidate: ReviewCandidate) {
    const before=candidate.beforeRefs[0], after=candidate.afterRefs[0];
    setChangeRows(current => [...current, { articleNumber:(after?.path ?? before?.path ?? [])[0]?.match(/\d+[a-zA-Z]?/)?.[0] ?? '', changeType:!before?'added':!after?'removed':'changed', note:'',
      beforeRef:before?{versionId:before.versionId,logicalId:before.logicalId,occurrenceId:before.occurrenceId,revisionId:before.revisionId,unitKind:before.kind==='text_entry'?'text_entry':'node'}:null,
      afterRef:after?{versionId:after.versionId,logicalId:after.logicalId,occurrenceId:after.occurrenceId,revisionId:after.revisionId,unitKind:after.kind==='text_entry'?'text_entry':'node'}:null }]);
    setDirty(true); go('passages');
  }
  async function saveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(saving.current)return; saving.current=true;setSavePending(true);setSaveError('');
    try {
      const response=await fetchWithTimeout('/editor/command',{method:'POST',headers:{accept:'application/json'},body:new FormData(event.currentTarget)});
      const result=await response.json();
      if(!response.ok||!result.destination){setSaveError(amendmentErrorMessage(result.key,locale)||copy('The draft could not be saved. Your edits are still here.','Der Entwurf konnte nicht gespeichert werden. Deine Eingaben bleiben erhalten.'));if(result.key==='title')go('details');return;}
      submitting.current=true;setDirty(false);window.location.assign(result.destination);
    } catch {setSaveError(copy('Saving could not be confirmed. Your edits are still here. Check the saved history before submitting again.','Das Speichern konnte nicht bestätigt werden. Deine Eingaben bleiben erhalten. Prüfe den gespeicherten Verlauf vor einem erneuten Versuch.'));}
    finally {saving.current=false;setSavePending(false);}
  }
  const pair = <Stack className={styles.pair} gap="field"><div className={styles.heading}><h2>{copy('Constitution versions','Verfassungsfassungen')}</h2>{!readOnly ? <Button type="button" size="sm" onClick={() => {setPairSource(sourceVersionId);setPairTarget(targetVersionId);dialog.current?.showModal();}}>{copy('Choose constitution versions','Verfassungsfassungen wählen')}</Button>:null}</div>
    <p className={styles.muted}>{copy('One before and one after for the whole constitution. Only affected passages need review.','Ein Vorher und ein Nachher für die gesamte Verfassung. Nur betroffene Passagen müssen geprüft werden.')}</p>
    <div className={styles.pairLabels}><div><span>{copy('Before','Vorher')}</span>{versionLabel(sourceVersionId)}</div><div><span>{copy('After','Nachher')}</span>{versionLabel(targetVersionId)}</div></div></Stack>;
  return <PageChromeSurface ref={root} className={styles.workspace}>
    <PageMenuFrame ref={menu}><PageMenuBar as="nav" label={copy('Amendment workspace','Änderungsarbeitsbereich')}>
      {views.map(item => <button key={item} type="button" className={chrome.tool} aria-pressed={view===item} aria-controls={'amendment-view-'+item} onClick={() => go(item)}>{labels[item]}{item==='review' && unresolved ? ` (${unresolved})` : ''}</button>)}
      {canSave ? <Button type="submit" form="amendment-draft-form" variant="primary" size="sm" disabled={savePending||pending} className={styles.menuSave}>{savePending?copy('Saving…','Wird gespeichert…'):copy('Save draft','Entwurf speichern')}</Button>:null}
    </PageMenuBar></PageMenuFrame>
    <Stack className={styles.body} gap="card">
      {saveError?<Alert tone="error">{saveError}</Alert>:null}
      {amendment?.status ? <Inline><Badge tone={amendment.status==='published'?'added':amendment.status==='withdrawn'?'removed':'changed'}><T value={statusMessage(amendment.status)} /></Badge>{dirty?<span className={styles.muted}>{copy('Unsaved changes','Ungespeicherte Änderungen')}</span>:null}</Inline>:null}
      <Stack as="form" id="amendment-draft-form" elementRef={form} action="/editor/command" method="post" hidden={view!=='details'&&view!=='passages'} onInput={() => setDirty(true)} onSubmit={saveDraft} onInvalidCapture={(event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault(); const field=event.target as HTMLElement; const next=field.closest('[data-amendment-task="details"]')?'details':'passages'; go(next);
        for(const details of Array.from(field.closest('[data-amendment-task]')?.querySelectorAll('details') ?? [])) if(details.contains(field))details.open=true;
        const passage=field.closest<HTMLElement>('[data-passage-index]'); if(passage){const index=passage.dataset.passageIndex;const url=new URL(window.location.href);url.searchParams.set('passage',String(Number(index)+1));window.history.replaceState(null,'',url);window.dispatchEvent(new PopStateEvent('popstate'));}
        requestAnimationFrame(() => { field.focus();field.scrollIntoView({block:'center'}); });
      }}>
        <input type="hidden" name="command" value="amendment-save"/><input type="hidden" name="amendmentId" value={amendmentId}/><input type="hidden" name="constitutionId" value={constitutionId}/>
        <input type="hidden" name="sourceVersionId" value={sourceVersionId}/><input type="hidden" name="targetVersionId" value={targetVersionId}/><input type="hidden" name="documentsJson" value={JSON.stringify(amendment?.documents ?? [])}/>
        <Stack hidden={view!=='details'} id="amendment-view-details" data-amendment-task="details">
          <h2>{labels.details}</h2>
          <Input id="amendment-title" name="title" label={<T value={ui.attrs.editorAmendmentsAmendmentformInputLabelTitle}/>} defaultValue={amendment?.title ?? ''} required disabled={readOnly}/>
          <Input id="amendment-citation" name="sourceReference" label={<T value={ui.attrs.editorAmendmentsAmendmentformInputLabelCitation}/>} defaultValue={amendment?.sourceReference ?? ''} disabled={readOnly}/>
          <Grid columns={2} variant="form"><Input id="amendment-enacted" name="enactedOn" type="date" label={<T value={ui.attrs.editorAmendmentsAmendmentformInputLabelEnacted}/>} defaultValue={amendment?.enactedOn ?? ''} disabled={readOnly}/><Input id="amendment-effective" name="effectiveOn" type="date" label={<T value={ui.attrs.editorAmendmentsAmendmentformInputLabelEffective}/>} defaultValue={amendment?.effectiveOn ?? ''} disabled={readOnly}/></Grid>
          <TextArea id="amendment-summary" name="summary" label={<T value={ui.attrs.editorAmendmentsAmendmentformTextAreaLabelSummary}/>} defaultValue={amendment?.summary ?? ''} disabled={readOnly}/>
          <Button type="button" onClick={() => go('passages')}>{copy('Continue to affected passages','Weiter zu betroffenen Passagen')}</Button>
        </Stack>
        <Stack hidden={view!=='passages'} id="amendment-view-passages" data-amendment-task="passages" gap="card">
          {pair}
          <TextArea id="amendment-comment" name="comment" label={copy('Public amendment comment','Öffentlicher Änderungskommentar')} defaultValue={amendment?.comment ?? ''} required disabled={readOnly} rows={4}/>
          {!readOnly ? <Inline><Button type="button" disabled={!contentAvailable||pending} onClick={suggest}>{pending?copy('Finding passages…','Passagen werden ermittelt…'):copy('Find affected passages','Betroffene Passagen ermitteln')}</Button>{!contentAvailable?<p className={styles.muted}>{copy('Constitution text is unavailable.','Verfassungstext ist nicht verfügbar.')}</p>:null}</Inline>:null}
          {suggestError?<Alert tone="error">{suggestError}</Alert>:null}
          <AmendmentChangesTable initialRows={changeRows} articleNumbers={articleNumbers} unitTreesByVersion={unitTreesByVersion} readerOwners={readerOwners} navigationRef={navigation} sourceVersionId={sourceVersionId} targetVersionId={targetVersionId} readOnly={readOnly} onRowsChange={rows => {setChangeRows(rows);setDirty(true);}}/>
        </Stack>
      </Stack>
      <section hidden={view!=='review'} id="amendment-view-review">
        {pairChanged ? <Alert tone="info">{copy('Save the new constitution pair before reviewing its differences.','Speichere das neue Verfassungspaar, bevor du seine Unterschiede prüfst.')}</Alert> : diffReview ? <DiffReviewQueue key={diffReview.revisionId} target={{kind:'amendment',id:amendmentId}} initial={diffReview} onReviewChange={setReview} readerOwners={readerOwners}
          rows={(amendment?.changes ?? []).map((change,index) => ({id:change.id,label:`${index+1}. ${t(changeTypeMessage(change.changeType))} ${change.articleNumber ?? ''} ${change.note ?? ''}`.trim()}))}
          canDecide={(canReviewDiff&&!readOnly)||canAcknowledgeDiff} canAcknowledge={canAcknowledgeDiff} onCorrectPairing={() => go('passages')} onAddRow={!readOnly?addCandidateRow:undefined}/> : <Alert tone="info">{copy('Save a draft with two published constitution snapshots to review detected differences.','Speichere einen Entwurf mit zwei veröffentlichten Verfassungsständen, um erkannte Unterschiede zu prüfen.')}</Alert>}
      </section>
      <Stack hidden={view!=='documents'} id="amendment-view-documents">
        {documentsPanel ?? <Alert tone="info">{copy('Save this amendment first, then upload or choose documents here.','Speichere diese Änderung zuerst. Danach kannst du hier Dokumente hochladen oder auswählen.')}</Alert>}
        {amendment?.documents?.length ? <details><summary>{copy('Older source references','Ältere Quellenverweise')}</summary><ul>{amendment.documents.map((document,index) => <li key={index}>{document.url?<a href={document.url} target="_blank" rel="noreferrer">{document.label||document.url}</a>:document.label||document.fileId}</li>)}</ul></details>:null}
      </Stack>
      <Stack hidden={view!=='history'} id="amendment-view-history" className={styles.history}>{historyPanel ?? <p>{copy('No saved revisions yet.','Noch keine gespeicherten Revisionen.')}</p>}</Stack>
      <Stack hidden={view!=='publication'} id="amendment-view-publication">
        <h2>{labels.publication}</h2>
        <p>{copy('Save the draft and resolve the detected differences before publication. Publishing makes the current saved draft public.','Speichere den Entwurf und kläre die erkannten Unterschiede vor der Veröffentlichung. Der aktuelle gespeicherte Entwurf wird dadurch öffentlich.')}</p>
        {dirty?<Alert tone="info">{copy('Save your changes before publishing.','Speichere deine Änderungen vor der Veröffentlichung.')}</Alert>:null}
        {unresolved?<Alert tone="info">{unresolved} {copy('differences still need review or acknowledgement.','Unterschiede benötigen noch Prüfung oder Bestätigung.')}</Alert>:null}
        {quoteReviewPanel}
        {canPublish ? <form action="/editor/command" method="post"><input type="hidden" name="command" value="amendment-publish"/><input type="hidden" name="amendmentId" value={amendmentId}/><Stack><label><input type="checkbox" required/> {copy('I confirm this revision is ready for publication.','Ich bestätige, dass diese Revision bereit zur Veröffentlichung ist.')}</label><Button disabled={dirty||unresolved>0}>{copy('Publish law','Änderungsgesetz veröffentlichen')}</Button></Stack></form>:<p className={styles.muted}>{copy('Publication requires a publisher and a saved amendment.','Die Veröffentlichung erfordert eine gespeicherte Änderung und die Veröffentlichungsrolle.')}</p>}
        {canWithdraw ? <details><summary>{copy('Withdraw published law','Veröffentlichtes Änderungsgesetz zurückziehen')}</summary><form action="/editor/command" method="post"><input type="hidden" name="command" value="amendment-withdraw"/><input type="hidden" name="amendmentId" value={amendmentId}/><Stack><label><input type="checkbox" required/> {copy('Confirm withdrawal from public view.','Rücknahme aus der öffentlichen Ansicht bestätigen.')}</label><Button>{copy('Withdraw','Zurückziehen')}</Button></Stack></form></details>:null}
      </Stack>
    </Stack>
    <dialog ref={dialog} className={['dialog',styles.dialog].join(' ')} aria-labelledby="amendment-pair-title"><Stack>
      <h2 id="amendment-pair-title">{copy('Choose constitution versions','Verfassungsfassungen wählen')}</h2><p>{copy('This pair applies to the whole amendment. Existing mappings stay visible for correction.','Dieses Paar gilt für die gesamte Änderung. Bestehende Zuordnungen bleiben zur Korrektur sichtbar.')}</p>
      <Select id="amendment-source-version" label={copy('Before constitution','Verfassung vorher')} value={pairSource} onChange={event=>setPairSource(event.target.value)}><option value="">{copy('Not selected','Nicht gewählt')}</option>{versions.map(version=><option key={version.id} value={version.id}>{versionLabel(version.id)}</option>)}</Select>
      <Select id="amendment-target-version" label={copy('After constitution','Verfassung nachher')} value={pairTarget} onChange={event=>setPairTarget(event.target.value)}><option value="">{copy('Not selected','Nicht gewählt')}</option>{versions.map(version=><option key={version.id} value={version.id}>{versionLabel(version.id)}</option>)}</Select>
      {pairSource&&pairSource===pairTarget?<Alert tone="error">{copy('Choose two different versions.','Wähle zwei unterschiedliche Fassungen.')}</Alert>:null}
      <Inline><Button type="button" variant="ghost" onClick={()=>dialog.current?.close()}>{copy('Cancel','Abbrechen')}</Button><Button type="button" disabled={Boolean(pairSource&&pairSource===pairTarget)} onClick={()=>{setSourceVersionId(pairSource);setTargetVersionId(pairTarget);setDirty(true);dialog.current?.close();}}>{copy('Use this pair','Dieses Paar verwenden')}</Button></Inline>
    </Stack></dialog>
  </PageChromeSurface>;
}
