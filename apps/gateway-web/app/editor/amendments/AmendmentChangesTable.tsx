'use client';

import { T, useTranslation } from '../../components/TranslationProvider';
import { ui, type UiMessage } from '../../../lib/messages';
import { builtinKindMessage } from '../../../lib/ui-labels';
import { useEffect, useMemo, useState, type Ref } from 'react';
import { Button, Input, Select, TextArea, Badge } from '../../components/ui';
import type { AmendmentUnitRef, ArticleSummary, OrderedEntry } from '../../../lib/api';
import { Stack, Inline } from '../../components/layout/Layout';
import { PassageComparison, type PassageSide } from '../PassageComparison';
import { OrderedContentTree } from '../../components/ConstitutionText';
import { PageContentsLayout, PageContentsBody, PageContentsNavigation } from '../../components/layout/PageChrome';
import { passageReaderHref, type ReaderOwner } from '../../../lib/reader-links';
import { orderedText } from '../../../lib/ordered-content';
import styles from './amendment-workspace.module.css';

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
  readerOwners?: Record<string, ReaderOwner>;
  navigationRef?: Ref<HTMLElement>;
};

function emptyRow(): ChangeRow {
  return { articleNumber: '', changeType: 'changed', note: '', beforeRef: null, afterRef: null };
}

function unitLabel(kind?: string | null, label?: string | null, title?: string | null): string {
  return [kind, label, title].filter(Boolean).join(' ');
}

/** Keep the shared text boundary rules; tables have a readable textual projection as well as the rich source view. */
function passageText(entries: OrderedEntry[]): string {
  const project = (items: OrderedEntry[]): OrderedEntry[] => items.map(entry => entry.node ? { ...entry, node:{...entry.node,content:project(entry.node.content)} } : entry.table ? {...entry,type:'text',text:[entry.table.caption,...entry.table.rows.map(row=>row.cells.map(cell=>cell.text).join('\t'))].filter(Boolean).join('\n')} : entry);
  return orderedText(project(entries));
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
        const text = passageText(node.content ?? []);
        result.push({
          versionId, logicalId: node.logicalId, occurrenceId: node.occurrenceId, rootOccurrenceId, revisionId: node.revisionId,
          unitKind: 'node', kind: node.kind, label: node.label ?? node.title ?? node.kind, breadcrumbs, text,
          display: `${breadcrumbs.join(' › ')}${text ? ` — ${text.slice(0, 120)}` : ''}`,
        });
        visitEntries(node.content, breadcrumbs, rootOccurrenceId);
      } else if (entry.type === 'text' && entry.logicalId && entry.revisionId && entry.occurrenceId) {
        const text = passageText([entry]);
        const breadcrumbs = [...parentPath, t(ui.remainingStatus.parentText)];
        result.push({
          versionId, logicalId: entry.logicalId, occurrenceId: entry.occurrenceId, rootOccurrenceId, revisionId: entry.revisionId,
          unitKind: 'text_entry', kind: 'parent_text', label: t(ui.remainingStatus.parentText), breadcrumbs, text,
          display: `${breadcrumbs.join(' › ')} — ${text.slice(0, 120)}`,
        });
      }
    }
  };
  for (const root of roots) {
    if (!root.logicalId || !root.revisionId) continue;
    const rootOccurrenceId = root.id;
    const label = unitLabel(root.kind ? kindLabel(root.kind) : t(ui.remainingStatus.article), root.articleNumber, root.title);
    const text = root.content ? passageText(root.content) : root.body ?? '';
    result.push({
      versionId, logicalId: root.logicalId, occurrenceId: root.id, rootOccurrenceId, revisionId: root.revisionId,
      unitKind: 'node', kind: root.kind ?? 'article', label: root.articleNumber, breadcrumbs: [label], text,
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
  readOnly = false, error, onRowsChange, readerOwners, navigationRef,
}: AmendmentChangesTableProps) {
  const t = useTranslation();
  const [rows, setRows] = useState<ChangeRow[]>(initialRows);
  const [search, setSearch] = useState<Record<string, string>>({});

  const [previousInitialRows, setPreviousInitialRows] = useState(initialRows);
  if (previousInitialRows !== initialRows) {
    setPreviousInitialRows(initialRows);
    setRows(initialRows);
  }

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

  const [active, setActive] = useState(0), [navigation, setNavigation] = useState(false);
  useEffect(() => {
    function restore() { const number = Number(new URL(window.location.href).searchParams.get('passage') ?? '1'); setActive(Number.isSafeInteger(number) && number > 0 ? number - 1 : 0); }
    queueMicrotask(restore); window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  const selectedIndex = Math.min(active, Math.max(0, rows.length - 1));
  function choose(index: number) {
    setActive(index);
    requestAnimationFrame(() => { const heading=document.querySelector<HTMLElement>('#amendment-passage-'+index+' h3');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});} });
    const url = new URL(window.location.href); url.searchParams.set('passage', String(index + 1)); window.history.pushState(null, '', url);
  }
  function updateRows(next: ChangeRow[] | ((current: ChangeRow[]) => ChangeRow[])) {
    const resolved = typeof next === 'function' ? next(rows) : next;
    setRows(resolved); onRowsChange?.(resolved);
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
    const selected = units.find(unit => unit.logicalId === row[key]?.logicalId && (!row[key]?.occurrenceId || unit.occurrenceId === row[key]?.occurrenceId));
    if (selected && !filtered.includes(selected)) filtered.unshift(selected);
    return (
      <Stack>
        <Input id={`change-${index}-${side}-search`} label={t(side === 'before' ? ui.remainingStatus.findSourceUnit : ui.remainingStatus.findTargetUnit)} type="search" value={query} disabled={readOnly} onChange={(event) => setSearch((current) => ({ ...current, [queryKey]: event.target.value }))} />
        <Select id={`change-${index}-${side}-unit`} label={t(side === 'before' ? ui.remainingStatus.beforeUnit : ui.remainingStatus.afterUnit)} value={row[key]?.occurrenceId ?? row[key]?.logicalId ?? ''} disabled={readOnly || !versionId} onChange={(event) => {
          const unit = units.find((candidate) => (candidate.occurrenceId ?? candidate.logicalId) === event.target.value);
          updateRow(index, { [key]: unit ?? null });
        }}>
          <option value=""><T value={ui.editor.amendments.amendmentchangestable.selectExactUnit} /></option>
          {filtered.map((unit) => <option key={unit.occurrenceId ?? unit.logicalId} value={unit.occurrenceId ?? unit.logicalId}>{unit.display}</option>)}
        </Select>
        {row[key]?.versionId && row[key]?.versionId !== versionId ? <p className="alert alert-error" role="alert"><T value={ui.editor.amendments.amendmentchangestable.thisSelectionBelongsToAnotherVersionChoose} /></p> : null}
      </Stack>
    );
  }

  function addRow() { updateRows([...rows, emptyRow()]); choose(rows.length); }
  function removeRow(index: number) {
    if (!window.confirm(t({ en: 'Remove this affected passage from the draft?', de: 'Diese betroffene Passage aus dem Entwurf entfernen?' }))) return;
    updateRows(rows.filter((_, rowIndex) => rowIndex !== index)); choose(Math.max(0, index - 1));
  }

  function side(ref: AmendmentUnitRef | null | undefined, prefix: string, required: boolean): PassageSide {
    if (!ref) return { text: '',emptyMessage:required?t({en:'Select an exact passage within the constitution pair.',de:'Wähle eine genaue Passage innerhalb des Verfassungspaars.'}):undefined };
    const units = unitsByVersion[ref.versionId ?? ''] ?? [];
    const exact = units.find(unit => unit.logicalId === ref.logicalId && (!ref.occurrenceId || unit.occurrenceId === ref.occurrenceId) && (!ref.revisionId || unit.revisionId === ref.revisionId));
    const roots = unitTreesByVersion[ref.versionId ?? ''] ?? [];
    let source: React.ReactNode;
    function find(entries: OrderedEntry[]): void {
      for (const entry of entries) {
        if (entry.node && entry.node.logicalId === ref!.logicalId && (!ref!.occurrenceId || entry.node.occurrenceId === ref!.occurrenceId)) {
          source = <OrderedContentTree entries={entry.node.content ?? []} idPrefix={prefix} />;
          return;
        }
        if (entry.type === 'text' && entry.logicalId === ref!.logicalId && (!ref!.occurrenceId || entry.occurrenceId === ref!.occurrenceId)) {
          source = <OrderedContentTree entries={[entry]} idPrefix={prefix} />;
          return;
        }
        if (entry.node) find(entry.node.content ?? []);
      }
    }
    const root = roots.find(root => root.logicalId === ref.logicalId && (!ref.occurrenceId || root.id === ref.occurrenceId));
    if (root && exact && root.content) source = <OrderedContentTree entries={root.content} idPrefix={prefix} />;
    else if (exact) for (const root of roots) find(root.content ?? []);
    const rootId = ref.rootOccurrenceId ?? exact?.rootOccurrenceId ?? ref.occurrenceId;
    return { text: exact?.text ?? ref.text ?? '', label: ref.breadcrumbs?.join(' › ') || exact?.breadcrumbs?.join(' › ') || ref.label || ref.logicalId || undefined,
      href: ref.versionId && rootId ? passageReaderHref(readerOwners?.[ref.versionId], ref.versionId, rootId, ref.occurrenceId ?? undefined) : undefined,
      identity: [ref.versionId, ref.logicalId, ref.occurrenceId, ref.revisionId].filter(Boolean).join(' · '),emptyMessage:!exact&&!ref.text?t({en:'The pinned wording is unavailable.',de:'Der festgelegte Wortlaut ist nicht verfügbar.'}):undefined, source };
  }

  return <Stack as="section" aria-labelledby="amendment-changes-title" className={styles.passages}>
    <div className={styles.heading}><h2 id="amendment-changes-title">{t({ en: 'Affected passages', de: 'Betroffene Passagen' })} <Badge>{rows.length}</Badge></h2>
      <Inline><Button type="button" size="sm" variant="ghost" aria-expanded={navigation} aria-controls="amendment-passage-navigation" onClick={() => setNavigation(!navigation)}>{t(navigation ? { en: 'Hide passage navigation', de: 'Passagennavigation ausblenden' } : { en: 'Show passage navigation', de: 'Passagennavigation einblenden' })}</Button>
        {!readOnly ? <Button type="button" size="sm" onClick={addRow}>{t({ en: 'Add passage', de: 'Passage hinzufügen' })}</Button> : null}</Inline></div>
    {error ? <p className="alert alert-error" role="alert">{error}</p> : null}
    <input type="hidden" name="changesJson" value={changesJson} readOnly />
    <datalist id={datalistId}>{articleNumbers.map((number) => <option key={number} value={number} />)}</datalist>
    <PageContentsLayout navigationRef={navigationRef} expanded={navigation} navigationId="amendment-passage-navigation" navigation={<PageContentsNavigation label={t({ en: 'Affected passages', de: 'Betroffene Passagen' })} title={t({ en: 'Affected passages', de: 'Betroffene Passagen' })} currentId={String(selectedIndex)} items={rows.map((row, index) => ({ id: String(index), href: '#amendment-passage-'+index, label: `${index+1}. ${row.afterRef?.label || row.beforeRef?.label || (row.articleNumber?`${t(ui.remainingStatus.article)} ${row.articleNumber}`:t({ en: 'Passage', de: 'Passage' }))}` }))} onSelect={id => choose(Number(id))} />}>
      <PageContentsBody>
        {!rows.length ? <p className={styles.muted}>{t({ en: 'No affected passages recorded. Find differences between the selected constitutions or add a passage.', de: 'Noch keine betroffenen Passagen erfasst. Ermittle Unterschiede zwischen den gewählten Verfassungen oder füge eine Passage hinzu.' })}</p> : null}
        {rows.map((row, index) => <Stack key={index} hidden={index !== selectedIndex} id={'amendment-passage-'+index} data-passage-index={index} className={styles.passage}>
          <div className={styles.heading}><h3>{index+1}. {row.afterRef?.label || row.beforeRef?.label || (row.articleNumber?`${t(ui.remainingStatus.article)} ${row.articleNumber}`:t({ en: 'Passage', de: 'Passage' }))} · {t(CHANGE_TYPES.find(type => type.value === row.changeType)?.label ?? ui.remainingStatus.changed)}</h3>
            <Inline><Button type="button" size="sm" disabled={selectedIndex===0} onClick={() => choose(selectedIndex-1)}>{t({ en: 'Previous', de: 'Zurück' })}</Button><Button type="button" size="sm" disabled={selectedIndex>=rows.length-1} onClick={() => choose(selectedIndex+1)}>{t({ en: 'Next', de: 'Weiter' })}</Button></Inline></div>
          <PassageComparison before={side(row.beforeRef,`amendment-${index}-before-`,row.changeType!=='added')} after={side(row.afterRef,`amendment-${index}-after-`,row.changeType!=='removed')} />
          <TextArea id={`change-note-${index}`} name={`changeNote-${index}`} label={t({ en: 'Passage note', de: 'Anmerkung zur Passage' })} value={row.note} disabled={readOnly} onChange={event => updateRow(index, { note: event.target.value })} />
          {row.legacyLinkUnresolved ? <p className="muted" role="status"><T value={ui.editor.amendments.amendmentchangestable.thisOlderChangeHasNoVerifiedExact} /></p> : null}
          {row.beforeRef?.versionId && row.beforeRef.versionId !== sourceVersionId || row.afterRef?.versionId && row.afterRef.versionId !== targetVersionId ? <p role="alert">{t({ en: 'This passage belongs to the previous constitution pair. Correct its mapping before saving.', de: 'Diese Passage gehört zum vorherigen Verfassungspaar. Korrigiere ihre Zuordnung vor dem Speichern.' })}</p> : null}
          <details className={styles.mapping}>
            <summary>{t({ en: 'Correct passage mapping', de: 'Passagenzuordnung korrigieren' })}</summary>
            <Stack><p className={styles.muted}>{t({ en: 'Choose locations within the amendment’s constitution-wide before/after pair.', de: 'Wähle Stellen innerhalb des verfassungsweiten Vorher-/Nachher-Paars dieser Änderung.' })}</p>
              <Inline align="end"><Input id={`change-article-${index}`} name={`changeArticle-${index}`} label={<T value={ui.attrs.editorAmendmentsAmendmentchangestableInputLabelArticle} />} list={datalistId} value={row.articleNumber} disabled={readOnly} onChange={event => updateRow(index, { articleNumber: event.target.value })} />
                <Select id={`change-type-${index}`} name={`changeType-${index}`} label={<T value={ui.attrs.editorAmendmentsAmendmentchangestableSelectLabelChange} />} value={row.changeType} disabled={readOnly} onChange={event => updateRow(index, { changeType: event.target.value })}>{CHANGE_TYPES.map(option => <option key={option.value} value={option.value}><T value={option.label} /></option>)}</Select></Inline>
              {renderPicker(row,index,'before')}{renderPicker(row,index,'after')}
              {row.changeType==='changed' && row.beforeRef && row.afterRef && !sameLogicalUnit(row.beforeRef,row.afterRef) ? <Input id={`change-link-reason-${index}`} label={<T value={ui.attrs.editorAmendmentsAmendmentchangestableInputLabelReason} />} value={row.linkReviewReason ?? ''} disabled={readOnly} required={!readOnly} onChange={event => updateRow(index, { linkReviewReason:event.target.value })} /> : null}
              {!readOnly ? <Button type="button" size="sm" variant="ghost" onClick={() => removeRow(index)}>{t({ en: 'Remove passage', de: 'Passage entfernen' })}</Button> : null}
            </Stack>
          </details>
        </Stack>)}
      </PageContentsBody>
    </PageContentsLayout>
  </Stack>;
}
