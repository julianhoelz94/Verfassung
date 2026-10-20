'use client';

import { T, useTranslation } from '../../components/TranslationProvider';
import { ui, type UiMessage } from '../../../lib/messages';
import { builtinKindMessage } from '../../../lib/ui-labels';
import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select } from '../../components/ui';
import type { AmendmentUnitRef, ArticleSummary, OrderedEntry } from '../../../lib/api';
import { Stack, Inline } from '../../components/layout/Layout';
import surfaceStyles from '../../components/surfaces.module.css';

export type ChangeRow = {
  articleNumber: string;
  changeType: string;
  note: string;
  beforeRef?: AmendmentUnitRef | null;
  afterRef?: AmendmentUnitRef | null;
  linkReviewReason?: string;
  legacyLinkUnresolved?: boolean;
};

type SelectableUnit = AmendmentUnitRef & { logicalId: string; display: string };

const CHANGE_TYPES = [
  { value: 'added', label: ui.remainingStatus.added },
  { value: 'changed', label: ui.remainingStatus.changed },
  { value: 'removed', label: ui.remainingStatus.removed },
] as const;

type AmendmentChangesTableProps = {
  initialRows: ChangeRow[];
  articleNumbers: string[];
  unitTreesByVersion: Record<string, ArticleSummary[]>;
  sourceVersionId: string;
  targetVersionId: string;
  readOnly?: boolean;
  error?: string | null;
  onRowsChange?: (rows: ChangeRow[]) => void;
};

function emptyRow(): ChangeRow {
  return { articleNumber: '', changeType: 'changed', note: '', beforeRef: null, afterRef: null };
}

function unitLabel(kind?: string | null, label?: string | null, title?: string | null): string {
  return [kind, label, title].filter(Boolean).join(' ');
}

export function treeUnits(versionId: string, roots: ArticleSummary[], t: (value: UiMessage) => string = value => value.en): SelectableUnit[] {
  const kindLabel = (kind: string) => {
    const label = builtinKindMessage(kind);
    return label ? t(label) : kind;
  };
  const result: SelectableUnit[] = [];
  const visitEntries = (entries: OrderedEntry[] | undefined, parentPath: string[], rootOccurrenceId: string) => {
    for (const entry of entries ?? []) {
      const node = entry.node;
      if (node?.logicalId && node.revisionId && node.occurrenceId) {
        const label = unitLabel(kindLabel(node.kind), node.label, node.title);
        const breadcrumbs = [...parentPath, label];
        const text = (node.content ?? []).filter((item) => item.type === 'text').map((item) => item.text ?? '').join(' ').trim();
        result.push({
          versionId, logicalId: node.logicalId, occurrenceId: node.occurrenceId, rootOccurrenceId, revisionId: node.revisionId,
          unitKind: 'node', kind: node.kind, label: node.label ?? node.title ?? node.kind, breadcrumbs, text,
          deepLink: `/versions/${encodeURIComponent(versionId)}/units/${encodeURIComponent(rootOccurrenceId)}?occurrenceId=${encodeURIComponent(node.occurrenceId)}`,
          display: `${breadcrumbs.join(' › ')}${text ? ` — ${text.slice(0, 120)}` : ''}`,
        });
        visitEntries(node.content, breadcrumbs, rootOccurrenceId);
      } else if (entry.type === 'text' && entry.logicalId && entry.revisionId && entry.occurrenceId) {
        const text = entry.text ?? '';
        const breadcrumbs = [...parentPath, t(ui.remainingStatus.parentText)];
        result.push({
          versionId, logicalId: entry.logicalId, occurrenceId: entry.occurrenceId, rootOccurrenceId, revisionId: entry.revisionId,
          unitKind: 'text_entry', kind: 'parent_text', label: t(ui.remainingStatus.parentText), breadcrumbs, text,
          deepLink: `/versions/${encodeURIComponent(versionId)}/units/${encodeURIComponent(rootOccurrenceId)}?occurrenceId=${encodeURIComponent(entry.occurrenceId)}`,
          display: `${breadcrumbs.join(' › ')} — ${text.slice(0, 120)}`,
        });
      }
    }
  };
  for (const root of roots) {
    if (!root.logicalId || !root.revisionId) continue;
    const rootOccurrenceId = root.id;
    const label = unitLabel(root.kind ? kindLabel(root.kind) : t(ui.remainingStatus.article), root.articleNumber, root.title);
    const text = root.body ?? '';
    result.push({
      versionId, logicalId: root.logicalId, occurrenceId: root.id, rootOccurrenceId, revisionId: root.revisionId,
      unitKind: 'node', kind: root.kind ?? 'article', label: root.articleNumber, breadcrumbs: [label], text,
      deepLink: `/versions/${encodeURIComponent(versionId)}/units/${encodeURIComponent(rootOccurrenceId)}?occurrenceId=${encodeURIComponent(root.id)}`,
      display: `${label}${text ? ` — ${text.slice(0, 120)}` : ''}`,
    });
    visitEntries(root.content, [label], rootOccurrenceId);
  }
  return result;
}

function sameLogicalUnit(a?: AmendmentUnitRef | null, b?: AmendmentUnitRef | null): boolean {
  return Boolean(a?.versionId && a.logicalId && a.logicalId === b?.logicalId);
}

export function AmendmentChangesTable({
  initialRows, articleNumbers, unitTreesByVersion, sourceVersionId, targetVersionId,
  readOnly = false, error, onRowsChange,
}: AmendmentChangesTableProps) {
  const t = useTranslation();
  const [rows, setRows] = useState<ChangeRow[]>(initialRows.length > 0 ? initialRows : [emptyRow()]);
  const [search, setSearch] = useState<Record<string, string>>({});

  useEffect(() => {
    setRows(initialRows.length > 0 ? initialRows : [emptyRow()]);
  }, [initialRows]);

  const unitsByVersion = useMemo(() => Object.fromEntries(
    Object.entries(unitTreesByVersion).map(([versionId, roots]) => [versionId, treeUnits(versionId, roots, t)]),
  ), [unitTreesByVersion, t]);
  const changesJson = useMemo(() => JSON.stringify(rows.map((row) => ({
    articleNumber: row.articleNumber.trim() || null,
    changeType: row.changeType,
    note: row.note.trim() || null,
    beforeRef: row.beforeRef ?? null,
    afterRef: row.afterRef?.versionId ? row.afterRef : null,
    pendingAfterLogicalId: row.afterRef?.versionId ? null : row.afterRef?.logicalId ?? null,
    linkReviewReason: row.linkReviewReason?.trim() || null,
  }))), [rows]);
  const datalistId = 'amendment-article-numbers';

  function updateRows(next: ChangeRow[] | ((current: ChangeRow[]) => ChangeRow[])) {
    setRows((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      onRowsChange?.(resolved);
      return resolved;
    });
  }

  function updateRow(index: number, patch: Partial<ChangeRow>) {
    updateRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, ...patch };
      if (patch.changeType === 'added') next.beforeRef = null;
      if (patch.changeType === 'removed') next.afterRef = null;
      return next;
    }));
  }

  function renderPicker(row: ChangeRow, index: number, side: 'before' | 'after') {
    const versionId = side === 'before' ? sourceVersionId : targetVersionId;
    const key = `${side}Ref` as const;
    const needed = row.changeType === 'changed' || (side === 'before' ? row.changeType === 'removed' : row.changeType === 'added');
    if (!needed) return null;
    const units = unitsByVersion[versionId] ?? [];
    const queryKey = `${index}-${side}`;
    const query = search[queryKey] ?? '';
    const filtered = units.filter((unit) => `${unit.display} ${unit.logicalId}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 100);
    return (
      <Stack>
        <Input id={`change-${index}-${side}-search`} label={t(side === 'before' ? ui.remainingStatus.findSourceUnit : ui.remainingStatus.findTargetUnit)} type="search" value={query} disabled={readOnly} onChange={(event) => setSearch((current) => ({ ...current, [queryKey]: event.target.value }))} />
        <Select id={`change-${index}-${side}-unit`} label={t(side === 'before' ? ui.remainingStatus.beforeUnit : ui.remainingStatus.afterUnit)} value={row[key]?.logicalId ?? ''} disabled={readOnly || !versionId} onChange={(event) => {
          const unit = units.find((candidate) => candidate.logicalId === event.target.value);
          updateRow(index, { [key]: unit ?? null });
        }}>
          <option value=""><T value={ui.editor.amendments.amendmentchangestable.selectExactUnit} /></option>
          {filtered.map((unit) => <option key={unit.logicalId} value={unit.logicalId}>{unit.display}</option>)}
        </Select>
        {row[key]?.text ? <p className="muted">{row[key]?.breadcrumbs?.join(' › ')} — {row[key]?.text}</p> : null}
        {row[key]?.versionId && row[key]?.versionId !== versionId ? <p className="alert alert-error" role="alert"><T value={ui.editor.amendments.amendmentchangestable.thisSelectionBelongsToAnotherVersionChoose} /></p> : null}
      </Stack>
    );
  }

  function addRow() { updateRows((current) => [...current, emptyRow()]); }
  function removeRow(index: number) { updateRows((current) => (current.length <= 1 ? [emptyRow()] : current.filter((_, rowIndex) => rowIndex !== index))); }

  return (
    <Stack as="section"  aria-labelledby="amendment-changes-title">
      <div className="section-header">
        <h2 className="section-title" id="amendment-changes-title"><T value={ui.editor.amendments.amendmentchangestable.changes} /></h2>
        {!readOnly ? <Button type="button" size="sm" onClick={addRow}><T value={ui.editor.amendments.amendmentchangestable.addRow} /></Button> : null}
      </div>
      {error ? <p className="alert alert-error" role="alert">{error}</p> : null}
      <input type="hidden" name="changesJson" value={changesJson} readOnly />
      <datalist id={datalistId}>{articleNumbers.map((number) => <option key={number} value={number} />)}</datalist>
      <Stack>
        {rows.map((row, index) => (
          <Stack key={`change-${index}`} className={["panel", surfaceStyles.panel].join(' ')}>
            <Inline align="end" className="form-row">
              <Input id={`change-article-${index}`} name={`changeArticle-${index}`} label={<T value={ui.attrs.editorAmendmentsAmendmentchangestableInputLabelArticle} />} list={datalistId} value={row.articleNumber} disabled={readOnly} onChange={(event) => updateRow(index, { articleNumber: event.target.value })} />
              <Select id={`change-type-${index}`} name={`changeType-${index}`} label={<T value={ui.attrs.editorAmendmentsAmendmentchangestableSelectLabelChange} />} value={row.changeType} disabled={readOnly} onChange={(event) => updateRow(index, { changeType: event.target.value })}>
                {CHANGE_TYPES.map((option) => <option key={option.value} value={option.value}><T value={option.label} /></option>)}
              </Select>
              <Input id={`change-note-${index}`} name={`changeNote-${index}`} label={<T value={ui.attrs.editorAmendmentsAmendmentchangestableInputLabelComment} />} value={row.note} disabled={readOnly} onChange={(event) => updateRow(index, { note: event.target.value })} />
              {!readOnly ? <Button type="button" size="sm" onClick={() => removeRow(index)}><T value={ui.editor.amendments.amendmentchangestable.remove} /></Button> : null}
            </Inline>
            <Inline align="end" className="form-row">{renderPicker(row, index, 'before')}{renderPicker(row, index, 'after')}</Inline>
            {row.changeType === 'changed' && row.beforeRef && row.afterRef && !sameLogicalUnit(row.beforeRef, row.afterRef) ? (
              <Input id={`change-link-reason-${index}`} label={<T value={ui.attrs.editorAmendmentsAmendmentchangestableInputLabelReason} />} value={row.linkReviewReason ?? ''} disabled={readOnly} required={!readOnly} onChange={(event) => updateRow(index, { linkReviewReason: event.target.value })} />
            ) : null}
            {row.changeType === 'changed' && row.beforeRef && row.afterRef ? <Stack  aria-label={t(ui.accessibility.beforeAfterWording)}>
              <p><strong><T value={ui.editor.amendments.amendmentchangestable.whatChanged} /></strong> <T value={ui.editor.amendments.amendmentchangestable.wordingChangedIn} />{" "}{row.afterRef.label ?? row.articleNumber ?? t(ui.remainingStatus.thisUnit)}.</p>
              {row.beforeRef.text ? <p><del>{row.beforeRef.text}</del></p> : null}
              {row.afterRef.text ? <p><ins>{row.afterRef.text}</ins></p> : null}
            </Stack> : null}
            {row.changeType === 'added' && row.afterRef ? <Stack><p><strong><T value={ui.editor.amendments.amendmentchangestable.whatChanged} /></strong> <T value={ui.editor.amendments.amendmentchangestable.added} />{" "}{row.afterRef.label ?? row.articleNumber ?? t(ui.remainingStatus.thisUnit)}.</p>{row.afterRef.text ? <p><ins>{row.afterRef.text}</ins></p> : null}</Stack> : null}
            {row.changeType === 'removed' && row.beforeRef ? <Stack><p><strong><T value={ui.editor.amendments.amendmentchangestable.whatChanged} /></strong> <T value={ui.editor.amendments.amendmentchangestable.removed} />{" "}{row.beforeRef.label ?? row.articleNumber ?? t(ui.remainingStatus.thisUnit)}.</p>{row.beforeRef.text ? <p><del>{row.beforeRef.text}</del></p> : null}</Stack> : null}
            {row.legacyLinkUnresolved ? <p className="muted" role="status"><T value={ui.editor.amendments.amendmentchangestable.thisOlderChangeHasNoVerifiedExact} /></p> : null}
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}
