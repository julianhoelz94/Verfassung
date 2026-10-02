'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select } from '../../components/ui';
import type { AmendmentUnitRef, ArticleSummary, OrderedEntry } from '../../../lib/api';

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
  { value: 'added', label: 'Added' },
  { value: 'changed', label: 'Changed' },
  { value: 'removed', label: 'Removed' },
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

export function treeUnits(versionId: string, roots: ArticleSummary[]): SelectableUnit[] {
  const result: SelectableUnit[] = [];
  const visitEntries = (entries: OrderedEntry[] | undefined, parentPath: string[], rootOccurrenceId: string) => {
    for (const entry of entries ?? []) {
      const node = entry.node;
      if (node?.logicalId && node.revisionId && node.occurrenceId) {
        const label = unitLabel(node.kind, node.label, node.title);
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
        const breadcrumbs = [...parentPath, 'Parent text'];
        result.push({
          versionId, logicalId: entry.logicalId, occurrenceId: entry.occurrenceId, rootOccurrenceId, revisionId: entry.revisionId,
          unitKind: 'text_entry', kind: 'parent_text', label: 'Parent text', breadcrumbs, text,
          deepLink: `/versions/${encodeURIComponent(versionId)}/units/${encodeURIComponent(rootOccurrenceId)}?occurrenceId=${encodeURIComponent(entry.occurrenceId)}`,
          display: `${breadcrumbs.join(' › ')} — ${text.slice(0, 120)}`,
        });
      }
    }
  };
  for (const root of roots) {
    if (!root.logicalId || !root.revisionId) continue;
    const rootOccurrenceId = root.id;
    const label = unitLabel(root.kind ?? 'Article', root.articleNumber, root.title);
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
  const [rows, setRows] = useState<ChangeRow[]>(initialRows.length > 0 ? initialRows : [emptyRow()]);
  const [search, setSearch] = useState<Record<string, string>>({});

  useEffect(() => {
    setRows(initialRows.length > 0 ? initialRows : [emptyRow()]);
  }, [initialRows]);

  const unitsByVersion = useMemo(() => Object.fromEntries(
    Object.entries(unitTreesByVersion).map(([versionId, roots]) => [versionId, treeUnits(versionId, roots)]),
  ), [unitTreesByVersion]);
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
      <div className="stack">
        <Input id={`change-${index}-${side}-search`} label={`Find ${side === 'before' ? 'source' : 'target'} unit`} type="search" value={query} disabled={readOnly} onChange={(event) => setSearch((current) => ({ ...current, [queryKey]: event.target.value }))} />
        <Select id={`change-${index}-${side}-unit`} label={`${side === 'before' ? 'Before' : 'After'} unit`} value={row[key]?.logicalId ?? ''} disabled={readOnly || !versionId} onChange={(event) => {
          const unit = units.find((candidate) => candidate.logicalId === event.target.value);
          updateRow(index, { [key]: unit ?? null });
        }}>
          <option value="">Select exact unit…</option>
          {filtered.map((unit) => <option key={unit.logicalId} value={unit.logicalId}>{unit.display}</option>)}
        </Select>
        {row[key]?.text ? <p className="muted">{row[key]?.breadcrumbs?.join(' › ')} — {row[key]?.text}</p> : null}
        {row[key]?.versionId && row[key]?.versionId !== versionId ? <p className="alert alert-error" role="alert">This selection belongs to another version. Choose a unit from the selected snapshot.</p> : null}
      </div>
    );
  }

  function addRow() { updateRows((current) => [...current, emptyRow()]); }
  function removeRow(index: number) { updateRows((current) => (current.length <= 1 ? [emptyRow()] : current.filter((_, rowIndex) => rowIndex !== index))); }

  return (
    <section className="stack" aria-labelledby="amendment-changes-title">
      <div className="section-header">
        <h2 className="section-title" id="amendment-changes-title">Changes</h2>
        {!readOnly ? <Button type="button" size="sm" onClick={addRow}>Add row</Button> : null}
      </div>
      {error ? <p className="alert alert-error" role="alert">{error}</p> : null}
      <input type="hidden" name="changesJson" value={changesJson} readOnly />
      <datalist id={datalistId}>{articleNumbers.map((number) => <option key={number} value={number} />)}</datalist>
      <div className="stack">
        {rows.map((row, index) => (
          <div key={`change-${index}`} className="panel stack">
            <div className="form-row">
              <Input id={`change-article-${index}`} name={`changeArticle-${index}`} label="Article" list={datalistId} value={row.articleNumber} disabled={readOnly} onChange={(event) => updateRow(index, { articleNumber: event.target.value })} />
              <Select id={`change-type-${index}`} name={`changeType-${index}`} label="Change type" value={row.changeType} disabled={readOnly} onChange={(event) => updateRow(index, { changeType: event.target.value })}>
                {CHANGE_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
              <Input id={`change-note-${index}`} name={`changeNote-${index}`} label="Comment on this change" value={row.note} disabled={readOnly} onChange={(event) => updateRow(index, { note: event.target.value })} />
              {!readOnly ? <Button type="button" size="sm" onClick={() => removeRow(index)}>Remove</Button> : null}
            </div>
            <div className="form-row">{renderPicker(row, index, 'before')}{renderPicker(row, index, 'after')}</div>
            {row.changeType === 'changed' && row.beforeRef && row.afterRef && !sameLogicalUnit(row.beforeRef, row.afterRef) ? (
              <Input id={`change-link-reason-${index}`} label="Reason for pairing different units" value={row.linkReviewReason ?? ''} disabled={readOnly} required={!readOnly} onChange={(event) => updateRow(index, { linkReviewReason: event.target.value })} />
            ) : null}
            {row.changeType === 'changed' && row.beforeRef && row.afterRef ? <div className="stack" aria-label="Before and after wording">
              <p><strong>What changed:</strong> Wording changed in {row.afterRef.label ?? row.articleNumber ?? 'this unit'}.</p>
              {row.beforeRef.text ? <p><del>{row.beforeRef.text}</del></p> : null}
              {row.afterRef.text ? <p><ins>{row.afterRef.text}</ins></p> : null}
            </div> : null}
            {row.changeType === 'added' && row.afterRef ? <div className="stack"><p><strong>What changed:</strong> Added {row.afterRef.label ?? row.articleNumber ?? 'this unit'}.</p>{row.afterRef.text ? <p><ins>{row.afterRef.text}</ins></p> : null}</div> : null}
            {row.changeType === 'removed' && row.beforeRef ? <div className="stack"><p><strong>What changed:</strong> Removed {row.beforeRef.label ?? row.articleNumber ?? 'this unit'}.</p>{row.beforeRef.text ? <p><del>{row.beforeRef.text}</del></p> : null}</div> : null}
            {row.legacyLinkUnresolved ? <p className="muted" role="status">This older change has no verified exact unit link.</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
