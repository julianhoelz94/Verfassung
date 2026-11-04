'use client';

import { useMemo, useState, type ComponentProps } from 'react';
import type { Amendment } from '../../../lib/api';
import type { AmendmentRevision } from '../../../lib/amendment-editor-api';
import { useTranslation } from '../../components/TranslationProvider';
import { Alert } from '../../components/ui';
import { Stack } from '../../components/layout/Layout';
import { AmendmentForm } from './AmendmentForm';
import { AmendmentRevisionPanel } from './AmendmentRevisionPanel';
import { PassageComparison, type PassageSide } from '../PassageComparison';
import { AmendmentRevisionDocuments } from './AmendmentRevisionDocuments';
import { passageReaderHref } from '../../../lib/reader-links';
import { changeTypeMessage } from '../../../lib/ui-labels';
import { treeUnits } from './AmendmentChangesTable';

type Props = Omit<ComponentProps<typeof AmendmentForm>, 'historyPanel'> & { amendment: Amendment; revisions: AmendmentRevision[] | null; canRestore: boolean };

/** History is a task view: the current form stays mounted while an older revision is inspected. */
export function AmendmentEditorLayout({ revisions, canRestore, ...props }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null), t = useTranslation();
  const ordered = useMemo(() => [...(revisions ?? [])].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)), [revisions]);
  const selected = ordered.find(revision => revision.id===selectedId);
  function text(ref: AmendmentRevision['changes'][number]['beforeRef']) {
    return ref?.text ?? (ref?.versionId ? treeUnits(ref.versionId, props.unitTreesByVersion[ref.versionId] ?? [],t).find(unit => unit.logicalId===ref.logicalId && (!ref.occurrenceId || unit.occurrenceId===ref.occurrenceId))?.text : '') ?? '';
  }
  function side(ref: AmendmentRevision['changes'][number]['beforeRef']): PassageSide {
    const root=ref?.rootOccurrenceId ?? ref?.occurrenceId;
    return {text:text(ref),label:ref?.breadcrumbs?.join(' › ') || ref?.label || undefined,identity:ref?[ref.versionId,ref.logicalId,ref.occurrenceId,ref.revisionId].filter(Boolean).join(' · '):undefined,
      href:ref?.versionId&&root?passageReaderHref(props.readerOwners?.[ref.versionId],ref.versionId,root,ref.occurrenceId):undefined};
  }
  return <AmendmentForm {...props} historyPanel={<Stack>
    {ordered.length ? <AmendmentRevisionPanel amendmentId={props.amendmentId} amendment={props.amendment} revisions={ordered} selectedRevisionId={selectedId} onSelectRevision={setSelectedId} canRestore={canRestore}/> : <p>{t({en:'No saved revisions yet.',de:'Noch keine gespeicherten Revisionen.'})}</p>}
    {selected ? <Stack><Alert tone="info">{t({en:'Inspecting an older revision. Your current draft remains in the workspace.',de:'Ältere Revision wird angezeigt. Dein aktueller Entwurf bleibt im Arbeitsbereich erhalten.'})}</Alert>
      <h2>{selected.title}</h2>
      <p>{props.versions.find(version=>version.id===selected.sourceVersionId)?.versionLabel ?? '—'} → {props.versions.find(version=>version.id===selected.targetVersionId)?.versionLabel ?? '—'}</p>
      <p>{selected.comment}</p><p>{selected.summary}</p>
      <details><summary>{t({en:'Revision details',de:'Revisionsangaben'})}</summary><dl><dt>{t({en:'Citation',de:'Fundstelle'})}</dt><dd>{selected.sourceReference || '—'}</dd><dt>{t({en:'Enacted date',de:'Beschlossen am'})}</dt><dd>{selected.enactedOn || '—'}</dd><dt>{t({en:'Effective date',de:'Gültig ab'})}</dt><dd>{selected.effectiveOn || '—'}</dd></dl>
        {selected.documents?.length ? <ul>{selected.documents.map((document,index)=><li key={index}>{document.url?<a href={document.url} target="_blank" rel="noreferrer">{document.label||document.url}</a>:document.label||document.fileId}</li>)}</ul>:null}
      </details>
      {selected.changes.map((change,index) => <section key={index}><h3>{change.articleNumber || String(index+1)} · {t(changeTypeMessage(change.changeType))}</h3><PassageComparison before={side(change.beforeRef)} after={side(change.afterRef)}/><p>{change.note}</p>{change.linkReviewReason?<p>{change.linkReviewReason}</p>:null}{change.pendingAfterLogicalId?<code>{change.pendingAfterLogicalId}</code>:null}</section>)}
      <AmendmentRevisionDocuments amendmentId={props.amendmentId} revisionId={selected.id}/>
    </Stack>:null}
  </Stack>}/>;
}
