'use client';

import { changeTypeMessage } from '../../lib/ui-labels';

import { T, useTranslation } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Button, Input, TextArea } from '../components/ui';
import type { ChangeRecordChange, ChangeRecordUnitRef } from '../../lib/editor-api';
import type { DraftEntry, DraftNode, StructuredPreview } from '../../lib/structured-editor';
import type { DiffReviewState, ReviewCandidate } from '../../lib/diff-review';
import { DiffReviewQueue } from './DiffReviewQueue';
import { Stack, Inline } from '../components/layout/Layout';
import surfaceStyles from '../components/surfaces.module.css';
import type { ContentOutline } from '../../lib/api';
import { workflowUi } from '../../lib/workflow-messages';
import { useDraftState } from './EditorDraftState';

type UnitOption = { logicalId: string; display: string; articleId: string; articleNumber: string; unitKind: 'node' | 'text_entry'; ref: ChangeRecordUnitRef };

function unitOptions(roots: DraftNode[], versionId: string, source: boolean, kindName: (kind: string) => string, parentText: string): UnitOption[] {
  const options: UnitOption[] = [];
  const visit = (entries: DraftEntry[], path: string[], root: DraftNode) => {
    for (const entry of entries) {
      if (entry.node) {
        const node = entry.node;
        const label = [kindName(node.kind), node.label, node.title].filter(Boolean).join(' ');
        const breadcrumbs = [...path, label];
        options.push({
          logicalId: node.logicalId, display: breadcrumbs.join(' › '), articleId: root.occurrenceId ?? root.logicalId,
          articleNumber: root.label ?? '', unitKind: 'node',
          ref: source ? { versionId, logicalId: node.logicalId, occurrenceId: node.occurrenceId, revisionId: node.revisionId, rootOccurrenceId: root.occurrenceId, unitKind: 'node' } : { logicalId: node.logicalId, unitKind: 'node' },
        });
        visit(node.content, breadcrumbs, root);
      } else if (entry.type === 'text' && entry.logicalId) {
        options.push({
          logicalId: entry.logicalId, display: `${[...path, parentText].join(' › ')} — ${(entry.text ?? '').slice(0, 100)}`,
          articleId: root.occurrenceId ?? root.logicalId, articleNumber: root.label ?? '', unitKind: 'text_entry',
          ref: source ? { versionId, logicalId: entry.logicalId, occurrenceId: entry.occurrenceId, revisionId: entry.revisionId, rootOccurrenceId: root.occurrenceId, unitKind: 'text_entry' } : { logicalId: entry.logicalId, unitKind: 'text_entry' },
        });
      }
    }
  };
  for (const root of roots) {
    options.push({
      logicalId: root.logicalId, display: [kindName(root.kind), root.label, root.title].filter(Boolean).join(' '),
      articleId: root.occurrenceId ?? root.logicalId, articleNumber: root.label ?? '', unitKind: 'node',
      ref: source ? { versionId, logicalId: root.logicalId, occurrenceId: root.occurrenceId, revisionId: root.revisionId, rootOccurrenceId: root.occurrenceId, unitKind: 'node' } : { logicalId: root.logicalId, unitKind: 'node' },
    });
    visit(root.content, [[kindName(root.kind), root.label, root.title].filter(Boolean).join(' ')], root);
  }
  return options;
}

function newChange(): ChangeRecordChange {
  return { articleId: '', articleNumber: '', changeType: 'changed', note: '', beforeRef: null, afterRef: null };
}

function isEmptyChange(change: ChangeRecordChange): boolean {
  return !change.articleId && !change.articleNumber && !change.note && !change.beforeRef && !change.afterRef && !change.pendingAfterLogicalId;
}

type PublishFormProps = {
  sessionId: string;
  versionId: string;
  articleId: string;
  hopKind: 'legal' | 'editorial_correction';
  status: string;
  canEdit: boolean;
  canPublish: boolean;
  record?: { title: string; comment: string; documents: { url?: string; label?: string }[]; changes?: ChangeRecordChange[] } | null;
  comment?: string | null;
  structuredDraft?: StructuredPreview | null;
  outline?: ContentOutline;
  diffReview?: DiffReviewState | null;
  canReviewDiff?: boolean;
  sourceEvidenceRevision?: number;
};

export function PublishForm({ sessionId, versionId, articleId, hopKind, status, canEdit, canPublish, record, comment, structuredDraft, outline, diffReview, canReviewDiff = false, sourceEvidenceRevision }: PublishFormProps) {
  const t = useTranslation();
  const { setDetailsDirty } = useDraftState();
  const unsaved = useRef(false);
  const saving = useRef(false);
  const markDirty = () => { unsaved.current = true; setDetailsDirty(true); };
  useEffect(() => () => setDetailsDirty(false), [setDetailsDirty]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (saving.current) { saving.current = false; return; }
      if (unsaved.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);
  const [changes, setChanges] = useState<ChangeRecordChange[]>(() => record?.changes?.length ? record.changes : [newChange()]);
  const [search, setSearch] = useState<Record<string, string>>({});
  const unitLists = useMemo(() => {
    const kindName = (kind: string) => outline?.kinds.find(item => item.kindCode === kind)?.displayLabel ?? kind;
    const parentText = t(ui.editorDynamic.parentText);
    return {
      before: unitOptions(structuredDraft?.sourceRoots ?? [], versionId, true, kindName, parentText),
      after: unitOptions(structuredDraft?.roots ?? [], versionId, false, kindName, parentText),
    };
  }, [structuredDraft, versionId, outline, t]);
  const beforeUnits = unitLists.before;
  const afterUnits = unitLists.after;
  function passage(change: ChangeRecordChange, side: 'before' | 'after') {
    const ref = side === 'before' ? change.beforeRef : change.afterRef;
    const logicalId = ref?.logicalId ?? (side === 'after' ? change.pendingAfterLogicalId : undefined);
    if (!logicalId) return '—';
    const unit = (side === 'before' ? beforeUnits : afterUnits).find(item => item.logicalId === logicalId);
    const label = unit?.display ?? `${t(ui.editorDynamic.unit)} ${change.articleNumber}`.trim();
    const rootOccurrenceId = ref?.rootOccurrenceId ?? unit?.ref.rootOccurrenceId;
    const href = side === 'before' && rootOccurrenceId && ref?.versionId
      ? `/versions/${encodeURIComponent(ref.versionId)}/units/${encodeURIComponent(rootOccurrenceId)}${ref.occurrenceId ? `?occurrenceId=${encodeURIComponent(ref.occurrenceId)}` : ''}`
      : side === 'after' && unit ? `/editor?sessionId=${encodeURIComponent(sessionId)}&versionId=${encodeURIComponent(versionId)}&selectedNode=${encodeURIComponent(logicalId)}` : undefined;
    return href ? <a href={href}>{label}</a> : label;
  }
  const fields = <>
    <input type="hidden" name="sessionId" value={sessionId} />
    <input type="hidden" name="versionId" value={versionId} />
    <input type="hidden" name="articleId" value={articleId} />
    <input type="hidden" name="hopKind" value={hopKind} />
    <input type="hidden" name="sourceEvidenceRevision" value={sourceEvidenceRevision ?? ''} />
  </>;
  const ready = hopKind === 'legal' ? Boolean(record) && (!structuredDraft || changes.length > 0 && changes.every((change) => change.changeType === 'added' ? Boolean(change.afterRef || change.pendingAfterLogicalId) : change.changeType === 'removed' ? Boolean(change.beforeRef) : Boolean(change.beforeRef && (change.afterRef || change.pendingAfterLogicalId)))) : Boolean(comment);
  function updateChange(index: number, patch: Partial<ChangeRecordChange>) {
    markDirty();
    setChanges((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, ...patch };
      if (patch.changeType === 'added') next.beforeRef = null;
      if (patch.changeType === 'removed') {
        next.afterRef = null;
        next.pendingAfterLogicalId = null;
      }
      if ('afterRef' in patch) next.pendingAfterLogicalId = patch.afterRef?.versionId ? null : patch.afterRef?.logicalId ?? null;
      return next;
    }));
  }
  function addCandidateRow(candidate: ReviewCandidate) {
    markDirty();
    const before = candidate.beforeRefs[0];
    const after = candidate.afterRefs[0];
    const unit = afterUnits.find((item) => item.logicalId === after?.logicalId) ?? beforeUnits.find((item) => item.logicalId === before?.logicalId);
    setChanges((current) => [...(current.length === 1 && isEmptyChange(current[0]) ? [] : current), {
      articleId: unit?.articleId ?? articleId,
      articleNumber: unit?.articleNumber ?? '',
      changeType: !before ? 'added' : !after ? 'removed' : 'changed',
      note: '',
      beforeRef: before ? beforeUnits.find((item) => item.logicalId === before.logicalId)?.ref ?? { versionId, logicalId: before.logicalId } : null,
      afterRef: after ? afterUnits.find((item) => item.logicalId === after.logicalId)?.ref ?? { logicalId: after.logicalId } : null,
    }]);
  }
  function picker(row: ChangeRecordChange, index: number, side: 'before' | 'after') {
    const required = row.changeType === 'changed' || (side === 'before' ? row.changeType === 'removed' : row.changeType === 'added');
    if (!required) return null;
    const list = side === 'before' ? beforeUnits : afterUnits;
    const queryKey = `${index}-${side}`;
    const query = search[queryKey] ?? '';
    const field = side === 'before' ? 'beforeRef' : 'afterRef';
    const selectedId = row[field]?.logicalId ?? (side === 'after' ? row.pendingAfterLogicalId : null) ?? '';
    const selected = list.find((unit) => unit.logicalId === selectedId);
    const visible = list.filter((unit) => unit.display.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 100);
    if (selected && !visible.includes(selected)) visible.unshift(selected);
    return <Stack>
      <Input id={`publish-${index}-${side}-search`} label={t(side === 'before' ? ui.editorDynamic.findSourceUnit : ui.editorDynamic.findDraftUnit)} type="search" value={query} onChange={(event) => setSearch((current) => ({ ...current, [queryKey]: event.target.value }))} />
      <label htmlFor={`publish-${index}-${side}-unit`}><T value={side === 'before' ? ui.editorDynamic.beforeUnit : ui.editorDynamic.draftAfterUnit} /></label>
      <select id={`publish-${index}-${side}-unit`} value={selectedId} required onChange={(event) => {
        const unit = list.find((candidate) => candidate.logicalId === event.target.value);
        if (!unit) { updateChange(index, { [field]: null }); return; }
        updateChange(index, { [field]: unit.ref, articleId: unit.articleId, articleNumber: unit.articleNumber });
      }}>
        <option value=""><T value={ui.editor.publishform.selectExactUnit} /></option>
        {visible.map((unit) => <option key={unit.logicalId} value={unit.logicalId}>{unit.display}</option>)}
      </select>
      {selected ? <p className="muted"><T value={ui.editor.publishform.selected} />{" "}{selected.display}</p> : null}
    </Stack>;
  }
  return (
    <Stack as="section" id="editor-change-record"  aria-label={t(hopKind === 'legal' ? ui.editorDynamic.changeRecord : ui.editorDynamic.transcriptionComment)}>
      <h3><T value={hopKind === 'legal' ? ui.editorDynamic.changeRecord : ui.editorDynamic.transcriptionComment} /></h3>
      {status === 'open' && canEdit ? (
        <Stack as="form" action="/editor/command" method="post" onChange={(event: FormEvent<HTMLFormElement>) => {
          if (!(event.target instanceof HTMLInputElement && event.target.type === 'search')) markDirty();
        }} onSubmit={() => { saving.current = true; }}>
          <input type="hidden" name="command" value="details" />
          {fields}
          {hopKind === 'legal' ? <>
            <Input id="recordTitle" name="recordTitle" label={<T value={ui.attrs.editorPublishformInputLabelTitle} />} defaultValue={record?.title ?? ''} required />
            <TextArea id="recordComment" name="recordComment" label={<T value={ui.attrs.editorPublishformTextAreaLabelComment} />} defaultValue={record?.comment ?? ''} required rows={3} />
            <Input id="documentUrl" name="documentUrl" label={<T value={ui.attrs.editorPublishformInputLabelDocumentURL} />} defaultValue={record?.documents[0]?.url ?? ''} required type="url" />
            <Input id="documentLabel" name="documentLabel" label={<T value={ui.attrs.editorPublishformInputLabelDocumentLabel} />} defaultValue={record?.documents[0]?.label ?? ''} />
            {structuredDraft ? <Stack as="fieldset"><legend><T value={ui.editor.publishform.exactConstitutionalUnits} /></legend>
              <p className="muted"><T value={workflowUi.changeLocations} /></p>
          <input type="hidden" name="changesJson" value={JSON.stringify(changes)} readOnly />
              {changes.map((row, index) => <Stack className={["panel", surfaceStyles.panel].join(' ')} key={`publish-change-${index}`}>
                <Inline align="end" className="form-row">
                  <label htmlFor={`publish-${index}-type`}><T value={ui.editor.publishform.changeType} /></label>
                  <select id={`publish-${index}-type`} value={row.changeType} onChange={(event) => updateChange(index, { changeType: event.target.value as ChangeRecordChange['changeType'] })}>
                    <option value="changed"><T value={ui.editor.publishform.changed} /></option><option value="added"><T value={ui.editor.publishform.added} /></option><option value="removed"><T value={ui.editor.publishform.removed} /></option>
                  </select>
                  <Input id={`publish-${index}-note`} label={<T value={ui.attrs.editorPublishformInputLabelCommentOn} />} value={row.note ?? ''} onChange={(event) => updateChange(index, { note: event.target.value })} />
                  <Button type="button" onClick={() => { markDirty(); setChanges((current) => current.length > 1 ? current.filter((_, rowIndex) => rowIndex !== index) : [newChange()]); }}><T value={ui.editor.publishform.remove} /></Button>
                </Inline>
                <Inline align="end" className="form-row">{picker(row, index, 'before')}{picker(row, index, 'after')}</Inline>
                {row.changeType === 'changed' && row.beforeRef && row.afterRef && row.beforeRef.logicalId !== row.afterRef.logicalId ? <Input id={`publish-${index}-reason`} label={<T value={ui.attrs.editorPublishformInputLabelReasonFor} />} required value={row.linkReviewReason ?? ''} onChange={(event) => updateChange(index, { linkReviewReason: event.target.value })} /> : null}
              </Stack>)}
              <Button type="button" onClick={() => { markDirty(); setChanges((current) => [...current, newChange()]); }}><T value={ui.editor.publishform.addChange} /></Button>
            </Stack> : null}
          </> : (
            <TextArea id="comment" name="comment" label={<T value={ui.attrs.editorPublishformTextAreaLabelWhatWas} />} defaultValue={comment ?? ''} required rows={3} />
          )}
          <Button><T value={ui.editor.publishform.save} />{" "}<T value={hopKind === 'legal' ? ui.remainingStatus.changeRecord : ui.remainingStatus.comment} /></Button>
        </Stack>
      ) : (
        hopKind === 'legal' && record ? (
          <Stack>
            <p><strong>{record.title}</strong></p>
            <p>{record.comment}</p>
            {record.changes?.map((change, index) => <p key={`${change.articleId}-${index}`}><T value={changeTypeMessage(change.changeType)} />: {passage(change, 'before')} → {passage(change, 'after')}{change.note ? ` · ${change.note}` : ''}</p>)}
            {record.documents.length > 0 ? (
              <ul>
                {record.documents.map((document, index) => (
                  <li key={`${document.url ?? document.label ?? 'document'}-${index}`}>
                    {document.url ? (
                      <a href={document.url} rel="noreferrer">
                        {document.label ?? document.url}
                      </a>
                    ) : (
                      document.label ?? <T value={ui.remainingStatus.archivedDocument} />
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </Stack>
        ) : (
          <p className="muted">{comment ?? t(ui.editorDynamic.noComment)}</p>
        )
      )}
      {status === 'approved' && canPublish ? (
        <Stack as="form" action="/editor/command" method="post">
          <input type="hidden" name="command" value="publish" />
          {fields}
          <Button variant="primary" disabled={!ready}>
            <T value={hopKind === 'legal' ? ui.editorDynamic.publishLegalVersion : ui.editorDynamic.publishTranscription} />
          </Button>
        </Stack>
      ) : null}
      {diffReview ? <DiffReviewQueue key={diffReview.draftGeneration} target={{ kind: 'editor', id: sessionId }} initial={diffReview}
        rows={(record?.changes ?? []).flatMap((change, index) => change.id ? [{ id: change.id, label: `${index + 1}. ${t(changeTypeMessage(change.changeType))} ${change.articleNumber} ${change.note ?? ''}`.trim() }] : [])}
        canDecide={status === 'open' && canEdit || canReviewDiff}
        canAcknowledge={canReviewDiff}
        onAddRow={status === 'open' && canEdit ? addCandidateRow : undefined} /> : null}
    </Stack>
  );
}
