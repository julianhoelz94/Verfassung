'use client';

import { useMemo, useState } from 'react';
import { Button, Input, TextArea } from '../components/ui';
import type { ChangeRecordChange, ChangeRecordUnitRef } from '../../lib/editor-api';
import type { DraftEntry, DraftNode, StructuredPreview } from '../../lib/structured-editor';

type UnitOption = { logicalId: string; display: string; articleId: string; articleNumber: string; unitKind: 'node' | 'text_entry'; ref: ChangeRecordUnitRef };

function unitOptions(roots: DraftNode[], versionId: string, source: boolean): UnitOption[] {
  const options: UnitOption[] = [];
  const visit = (entries: DraftEntry[], path: string[], root: DraftNode) => {
    for (const entry of entries) {
      if (entry.node) {
        const node = entry.node;
        const label = [node.kind, node.label, node.title].filter(Boolean).join(' ');
        const breadcrumbs = [...path, label];
        options.push({
          logicalId: node.logicalId, display: breadcrumbs.join(' › '), articleId: root.occurrenceId ?? root.logicalId,
          articleNumber: root.label ?? '', unitKind: 'node',
          ref: source ? { versionId, logicalId: node.logicalId, occurrenceId: node.occurrenceId, revisionId: node.revisionId, rootOccurrenceId: root.occurrenceId, unitKind: 'node' } : { logicalId: node.logicalId, unitKind: 'node' },
        });
        visit(node.content, breadcrumbs, root);
      } else if (entry.type === 'text' && entry.logicalId) {
        options.push({
          logicalId: entry.logicalId, display: `${[...path, 'Parent text'].join(' › ')} — ${(entry.text ?? '').slice(0, 100)}`,
          articleId: root.occurrenceId ?? root.logicalId, articleNumber: root.label ?? '', unitKind: 'text_entry',
          ref: source ? { versionId, logicalId: entry.logicalId, occurrenceId: entry.occurrenceId, revisionId: entry.revisionId, rootOccurrenceId: root.occurrenceId, unitKind: 'text_entry' } : { logicalId: entry.logicalId, unitKind: 'text_entry' },
        });
      }
    }
  };
  for (const root of roots) {
    options.push({
      logicalId: root.logicalId, display: [root.kind, root.label, root.title].filter(Boolean).join(' '),
      articleId: root.occurrenceId ?? root.logicalId, articleNumber: root.label ?? '', unitKind: 'node',
      ref: source ? { versionId, logicalId: root.logicalId, occurrenceId: root.occurrenceId, revisionId: root.revisionId, rootOccurrenceId: root.occurrenceId, unitKind: 'node' } : { logicalId: root.logicalId, unitKind: 'node' },
    });
    visit(root.content, [root.kind, root.label, root.title].filter((part): part is string => Boolean(part)), root);
  }
  return options;
}

function newChange(): ChangeRecordChange {
  return { articleId: '', articleNumber: '', changeType: 'changed', note: '', beforeRef: null, afterRef: null };
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
};

export function PublishForm({ sessionId, versionId, articleId, hopKind, status, canEdit, canPublish, record, comment, structuredDraft }: PublishFormProps) {
  const [changes, setChanges] = useState<ChangeRecordChange[]>(() => record?.changes?.length ? record.changes : [newChange()]);
  const [search, setSearch] = useState<Record<string, string>>({});
  const beforeUnits = useMemo(() => unitOptions(structuredDraft?.sourceRoots ?? [], versionId, true), [structuredDraft, versionId]);
  const afterUnits = useMemo(() => unitOptions(structuredDraft?.roots ?? [], versionId, false), [structuredDraft, versionId]);
  const fields = <>
    <input type="hidden" name="sessionId" value={sessionId} />
    <input type="hidden" name="versionId" value={versionId} />
    <input type="hidden" name="articleId" value={articleId} />
    <input type="hidden" name="hopKind" value={hopKind} />
  </>;
  const ready = hopKind === 'legal' ? Boolean(record) && (!structuredDraft || changes.length > 0 && changes.every((change) => change.changeType === 'added' ? Boolean(change.afterRef) : change.changeType === 'removed' ? Boolean(change.beforeRef) : Boolean(change.beforeRef && change.afterRef))) : Boolean(comment);
  function updateChange(index: number, patch: Partial<ChangeRecordChange>) {
    setChanges((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, ...patch };
      if (patch.changeType === 'added') next.beforeRef = null;
      if (patch.changeType === 'removed') next.afterRef = null;
      return next;
    }));
  }
  function picker(row: ChangeRecordChange, index: number, side: 'before' | 'after') {
    const required = row.changeType === 'changed' || (side === 'before' ? row.changeType === 'removed' : row.changeType === 'added');
    if (!required) return null;
    const list = side === 'before' ? beforeUnits : afterUnits;
    const queryKey = `${index}-${side}`;
    const query = search[queryKey] ?? '';
    const visible = list.filter((unit) => unit.display.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 100);
    const field = side === 'before' ? 'beforeRef' : 'afterRef';
    const selected = list.find((unit) => unit.logicalId === row[field]?.logicalId);
    return <div className="stack">
      <Input id={`publish-${index}-${side}-search`} label={`Find ${side === 'before' ? 'source' : 'draft'} unit`} type="search" value={query} onChange={(event) => setSearch((current) => ({ ...current, [queryKey]: event.target.value }))} />
      <label htmlFor={`publish-${index}-${side}-unit`}>{side === 'before' ? 'Before unit' : 'Draft after unit'}</label>
      <select id={`publish-${index}-${side}-unit`} value={row[field]?.logicalId ?? ''} required onChange={(event) => {
        const unit = list.find((candidate) => candidate.logicalId === event.target.value);
        if (!unit) return;
        updateChange(index, { [field]: unit.ref, articleId: unit.articleId, articleNumber: unit.articleNumber });
      }}>
        <option value="">Select exact unit…</option>
        {visible.map((unit) => <option key={unit.logicalId} value={unit.logicalId}>{unit.display}</option>)}
      </select>
      {selected ? <p className="muted">Selected: {selected.display}</p> : null}
    </div>;
  }
  return (
    <section className="stack" aria-label={hopKind === 'legal' ? 'Change record' : 'Transcription comment'}>
      <h3>{hopKind === 'legal' ? 'Change record' : 'Transcription comment'}</h3>
      {status === 'open' && canEdit ? (
        <form action="/editor/command" method="post" className="stack">
          <input type="hidden" name="command" value="details" />
          {fields}
          {hopKind === 'legal' ? <>
            <Input id="recordTitle" name="recordTitle" label="Title" defaultValue={record?.title ?? ''} required />
            <TextArea id="recordComment" name="recordComment" label="Comment" defaultValue={record?.comment ?? ''} required rows={3} />
            <Input id="documentUrl" name="documentUrl" label="Document URL" defaultValue={record?.documents[0]?.url ?? ''} required type="url" />
            <Input id="documentLabel" name="documentLabel" label="Document label" defaultValue={record?.documents[0]?.label ?? ''} />
            {structuredDraft ? <fieldset className="stack"><legend>Exact constitutional units</legend>
              <p className="muted">Choose the source unit and draft unit for each change. Draft unit identities are resolved to the published snapshot after the legal version is created.</p>
          <input type="hidden" name="changesJson" value={JSON.stringify(changes)} readOnly />
              {changes.map((row, index) => <div className="panel stack" key={`publish-change-${index}`}>
                <div className="form-row">
                  <label htmlFor={`publish-${index}-type`}>Change type</label>
                  <select id={`publish-${index}-type`} value={row.changeType} onChange={(event) => updateChange(index, { changeType: event.target.value as ChangeRecordChange['changeType'] })}>
                    <option value="changed">Changed</option><option value="added">Added</option><option value="removed">Removed</option>
                  </select>
                  <Input id={`publish-${index}-note`} label="Comment on this change" value={row.note ?? ''} onChange={(event) => updateChange(index, { note: event.target.value })} />
                  <Button type="button" onClick={() => setChanges((current) => current.length > 1 ? current.filter((_, rowIndex) => rowIndex !== index) : [newChange()])}>Remove</Button>
                </div>
                <div className="form-row">{picker(row, index, 'before')}{picker(row, index, 'after')}</div>
                {row.changeType === 'changed' && row.beforeRef && row.afterRef && row.beforeRef.logicalId !== row.afterRef.logicalId ? <Input id={`publish-${index}-reason`} label="Reason for pairing different units" required value={row.linkReviewReason ?? ''} onChange={(event) => updateChange(index, { linkReviewReason: event.target.value })} /> : null}
              </div>)}
              <Button type="button" onClick={() => setChanges((current) => [...current, newChange()])}>Add change</Button>
            </fieldset> : null}
          </> : (
            <TextArea id="comment" name="comment" label="What was corrected in this transcription?" defaultValue={comment ?? ''} required rows={3} />
          )}
          <Button>Save {hopKind === 'legal' ? 'change record' : 'comment'}</Button>
        </form>
      ) : (
        hopKind === 'legal' && record ? (
          <div className="stack">
            <p><strong>{record.title}</strong></p>
            <p>{record.comment}</p>
            {record.changes?.map((change, index) => <p key={`${change.articleId}-${index}`}>{change.changeType}: {change.beforeRef?.logicalId ?? '—'} → {change.afterRef?.logicalId ?? '—'}{change.note ? ` · ${change.note}` : ''}</p>)}
            {record.documents.length > 0 ? (
              <ul>
                {record.documents.map((document, index) => (
                  <li key={`${document.url ?? document.label ?? 'document'}-${index}`}>
                    {document.url ? (
                      <a href={document.url} rel="noreferrer">
                        {document.label ?? document.url}
                      </a>
                    ) : (
                      document.label ?? 'Archived document'
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="muted">{comment ?? 'No comment saved.'}</p>
        )
      )}
      {status === 'approved' && canPublish ? (
        <form action="/editor/command" method="post" className="stack">
          <input type="hidden" name="command" value="publish" />
          {fields}
          <Button variant="primary" disabled={!ready}>
            {hopKind === 'legal' ? 'Publish new legal version' : 'Publish transcription'}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
