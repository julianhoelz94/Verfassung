'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select } from '../../components/ui';

export type ChangeRow = {
  articleNumber: string;
  changeType: string;
  note: string;
};

const CHANGE_TYPES = [
  { value: 'added', label: 'Added' },
  { value: 'changed', label: 'Changed' },
  { value: 'removed', label: 'Removed' },
] as const;

type AmendmentChangesTableProps = {
  initialRows: ChangeRow[];
  articleNumbers: string[];
  readOnly?: boolean;
  error?: string | null;
  onRowsChange?: (rows: ChangeRow[]) => void;
};

function emptyRow(): ChangeRow {
  return { articleNumber: '', changeType: 'changed', note: '' };
}

export function AmendmentChangesTable({
  initialRows,
  articleNumbers,
  readOnly = false,
  error,
  onRowsChange,
}: AmendmentChangesTableProps) {
  const [rows, setRows] = useState<ChangeRow[]>(initialRows.length > 0 ? initialRows : [emptyRow()]);

  useEffect(() => {
    setRows(initialRows.length > 0 ? initialRows : [emptyRow()]);
  }, [initialRows]);

  function updateRows(next: ChangeRow[] | ((current: ChangeRow[]) => ChangeRow[])) {
    setRows((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      onRowsChange?.(resolved);
      return resolved;
    });
  }

  const changesJson = useMemo(
    () =>
      JSON.stringify(
        rows.map((row) => ({
          articleNumber: row.articleNumber.trim() || null,
          changeType: row.changeType,
          note: row.note.trim() || null,
        })),
      ),
    [rows],
  );
  const datalistId = 'amendment-article-numbers';

  function updateRow(index: number, patch: Partial<ChangeRow>) {
    updateRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    updateRows((current) => [...current, emptyRow()]);
  }

  function removeRow(index: number) {
    updateRows((current) => (current.length <= 1 ? [emptyRow()] : current.filter((_, rowIndex) => rowIndex !== index)));
  }

  return (
    <section className="stack" aria-labelledby="amendment-changes-title">
      <div className="section-header">
        <h2 className="section-title" id="amendment-changes-title">
          Changes
        </h2>
        {!readOnly ? (
          <Button type="button" size="sm" onClick={addRow}>
            Add row
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      ) : null}
      <input type="hidden" name="changesJson" value={changesJson} readOnly />
      <datalist id={datalistId}>
        {articleNumbers.map((number) => (
          <option key={number} value={number} />
        ))}
      </datalist>
      <div className="stack">
        {rows.map((row, index) => (
          <div key={`change-${index}`} className="form-row">
            <Input
              id={`change-article-${index}`}
              name={`changeArticle-${index}`}
              label="Article"
              list={datalistId}
              value={row.articleNumber}
              disabled={readOnly}
              onChange={(event) => updateRow(index, { articleNumber: event.target.value })}
            />
            <Select
              id={`change-type-${index}`}
              name={`changeType-${index}`}
              label="Change type"
              value={row.changeType}
              disabled={readOnly}
              onChange={(event) => updateRow(index, { changeType: event.target.value })}
            >
              {CHANGE_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Input
              id={`change-note-${index}`}
              name={`changeNote-${index}`}
              label="Note"
              value={row.note}
              disabled={readOnly}
              onChange={(event) => updateRow(index, { note: event.target.value })}
            />
            {!readOnly ? (
              <Button type="button" size="sm" onClick={() => removeRow(index)}>
                Remove
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
