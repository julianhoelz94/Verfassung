'use client';

import { fetchWithTimeout } from '../../lib/fetch-with-timeout';


import { T, useTranslation } from '../components/TranslationProvider';
import { ui, type UiMessage } from '../../lib/messages';
import { useEffect, useRef, useState } from 'react';
import type { ContentOutline } from '../../lib/api';
import { applyOperation, draftDifferences, findNode, nodes, scopedNodes, sentenceParts, token, validateDraft, type DraftDifference, type DraftEntry, type DraftNode, type DraftOperation, type StructuredPreview } from '../../lib/structured-editor';
import { useDraftState } from './EditorDraftState';
import { Button } from '../components/ui';
import { Stack } from '../components/layout/Layout';

class LocalizedEditorError extends Error {
  constructor(readonly copy: UiMessage) { super(copy.en); }
}

function differenceField(field: string): UiMessage {
  switch (field) {
    case 'title': return ui.remainingStatus.title;
    case 'label': return ui.remainingStatus.label;
    case 'text': return ui.editorDynamic.text;
    case 'parent': return ui.editorDynamic.parentText;
    case 'position': return ui.editorDefaults.position;
    case 'rich': return ui.editorDefaults.rich;
    case 'inserted': return ui.editorDefaults.inserted;
    case 'removed': return ui.editor.publishform.removed;
    default: return ui.editor.structurededitor.changes;
  }
}

type ReviewDifference = DraftDifference & { sourceLink?: string; targetLink?: string };
type Props = { review?: ReviewDifference[]; preview: StructuredPreview; outline: ContentOutline; rootId: string; versionId: string; articleId: string; constitutionId: string; editable: boolean; canManageStructure?: boolean; scope?: string; selectedNode?: string; publishedVersionId?: string | null; unitMapping?: Record<string, string> | null };
export function StructuredEditor({ review = [], preview, outline, rootId, versionId, articleId, constitutionId, editable, canManageStructure = false, scope: initialScope, selectedNode, publishedVersionId, unitMapping }: Props) {
  const t = useTranslation();
  const [sourceRoots, setSourceRoots] = useState(preview.sourceRoots);
  const [overviewRoots, setOverviewRoots] = useState<DraftNode[]>([]);
  const [loadedRootIds, setLoadedRootIds] = useState([rootId]);
  const [loading, setLoading] = useState(false);
  const [roots, setRoots] = useState(preview.roots);
  const [operations, setOperations] = useState<DraftOperation[]>([]);
  const [history, setHistory] = useState<{ roots: DraftNode[]; operations: DraftOperation[] }[]>([]);
  const saving = useRef(false);
  const [selection, setSelection] = useState(selectedNode ?? rootId);
  const initialRoot = findNode(preview.roots, rootId) ?? preview.roots[0];
  const defaultScope = scopedNodes(preview.roots, rootId, selectedNode ?? rootId, 'article').length ? 'article' : initialRoot.kind;
  const kindName = (kindCode: string) => outline.kinds.find(kind => kind.kindCode === kindCode)?.displayLabel ?? kindCode;
  const [scope, setScope] = useState(initialScope === 'constitution' || (initialScope && scopedNodes(preview.roots, rootId, selectedNode ?? rootId, initialScope).length) ? initialScope! : defaultScope);
  const [message, setMessage] = useState('');
  const { setDirty } = useDraftState();
  useEffect(() => { setDirty(operations.length > 0); return () => setDirty(false); }, [operations.length, setDirty]);
  useEffect(() => {
    function guard(event: BeforeUnloadEvent) {
      if (saving.current) { saving.current = false; return; }
      if (operations.length) { event.preventDefault(); event.returnValue = ''; }
    }
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [operations.length]);
  const caret = useRef<Record<string, number>>({});
  const ranges = useRef<Record<string, { start: number; end: number }>>({});
  const [referenceTargets, setReferenceTargets] = useState<Record<string, string>>({});
  const allNodes = nodes(roots);
  const root = roots.find(root => nodes([root]).some(node => node.logicalId === selection || node.content.some(entry => entry.logicalId === selection))) ?? findNode(roots, rootId) ?? roots[0];
  const errors = validateDraft(roots, outline, t);
  const loadedIds = new Set(nodes([...sourceRoots, ...roots]).flatMap(node => [node.logicalId, ...node.content.map(entry => entry.logicalId).filter((id): id is string => Boolean(id))]));
  const differences: ReviewDifference[] = [...review.filter(item => !loadedIds.has(item.logicalId)), ...draftDifferences(sourceRoots, roots)];
  function remember(view: string, selected: string) {
    const url = new URL(window.location.href); url.searchParams.set('scope', view); url.searchParams.set('selectedNode', selected); window.history.replaceState(null, '', url);
  }
  async function loadView(view: string, selected = selection, fullRootId?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ sessionId: preview.sessionId, scope: view });
      if (fullRootId) params.set('rootId', fullRootId);
      const response = await fetchWithTimeout(`/editor/view?${params}`, { cache: 'no-store' });
      if (!response.ok) throw new LocalizedEditorError(ui.editorDefaults.viewRetry);
      const loaded: StructuredPreview = await response.json();
      if (loaded.generation !== preview.generation || loaded.settingsRevisionId !== preview.settingsRevisionId) throw new LocalizedEditorError(ui.editorDefaults.sessionChanged);
      if (fullRootId) {
        const newRoot = loaded.roots.find(root => root.logicalId === fullRootId);
        const original = loaded.sourceRoots.find(root => root.logicalId === fullRootId);
        if (newRoot) {
          setRoots(current => current.map(root => root.logicalId === fullRootId ? newRoot : root));
          setHistory(current => current.map(snapshot => ({ ...snapshot, roots: snapshot.roots.map(root => root.logicalId === fullRootId ? newRoot : root) })));
          setLoadedRootIds(current => [...current, fullRootId]);
        }
        if (original) setSourceRoots(current => current.map(root => root.logicalId === fullRootId ? original : root));
      } else setOverviewRoots(loaded.roots);
      setScope(view); setSelection(selected); remember(view, selected);
    } catch (error) { setMessage(t(error instanceof LocalizedEditorError ? error.copy : ui.state.viewLoadFailed)); }
    finally { setLoading(false); }
  }
  function isOverviewScope(view: string) {
    const index = outline.kinds.findIndex(kind => kind.kindCode === view);
    const article = outline.kinds.findIndex(kind => kind.kindCode === 'article');
    return view === 'constitution' || (article >= 0 && index >= 0 && index < article && !outline.kinds[index].root);
  }
  function changeScope(view: string) {
    if (isOverviewScope(view)) void loadView(view);
    else { setScope(view); remember(view, selection); }
  }
  useEffect(() => {
    if (isOverviewScope(scope)) void loadView(scope);
    // Only initial navigation; subsequent changes explicitly call loadView.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function select(id: string) { setSelection(id); remember(scope, id); }
  function transaction(build: (emit: (operation: Omit<DraftOperation, 'id'>) => DraftOperation, current: () => DraftNode[]) => void) {
    let nextRoots = roots; let nextOperations = operations;
    try {
      build(op => {
        const previous = nextOperations.at(-1);
        const coalesce = previous && previous.targetId === op.targetId && previous.type === op.type && ['replace_text', 'set_metadata'].includes(op.type);
        const command = coalesce ? { ...op, id: previous.id, expectedRevisionId: previous.expectedRevisionId } : { ...op, id: crypto.randomUUID() };
        nextRoots = applyOperation(nextRoots, command);
        nextOperations = coalesce ? [...nextOperations.slice(0, -1), command] : [...nextOperations, command];
        return command;
      }, () => nextRoots);
      setHistory([...history, { roots, operations }]); setRoots(nextRoots); setOperations(nextOperations); setMessage(t(ui.state.unsavedChanges));
    } catch { setMessage(t(ui.state.invalidChange)); }
  }
  function change(op: Omit<DraftOperation, 'id'>) { transaction(emit => { emit(op); }); }
  function undo() {
    const previous = history.at(-1); if (!previous) return;
    setRoots(previous.roots); setOperations(previous.operations); setHistory(history.slice(0, -1)); setMessage(t(ui.state.lastChangeUndone));
  }
  function createNode(kindCode: string, ancestors: Set<string> = new Set()): DraftNode {
      const level = outline.kinds.find(kind => kind.kindCode === kindCode);
      if (!level || ancestors.has(kindCode)) throw new Error(`Invalid kind ${kindCode}`);
      const childKind = level.allowedChildKinds[0];
      return { logicalId: crypto.randomUUID(), kind: level.kindCode, label: level.labelPolicy === 'required' ? t(ui.editorDefaults.newLabel) : null, title: level.titlePolicy === 'required' ? t(ui.editorDefaults.newTitle) : null, content: childKind ? [{ type: 'child', node: createNode(childKind, new Set([...ancestors, kindCode])) }] : [{ type: 'text', logicalId: crypto.randomUUID(), text: '' }] };
  }
  function newChild(parent: DraftNode, position: number, kindCode: string) {
    change({ type: 'insert_child', targetId: parent.logicalId, expectedRevisionId: token(parent), position, node: createNode(kindCode) });
  }
  function renderNode(node: DraftNode): React.ReactNode {
    const level = outline.kinds.find(kind => kind.kindCode === node.kind)!;
    const children = node.content.some(entry => entry.node);
    return <section key={node.logicalId} className={`structured-unit ${selection === node.logicalId ? 'is-selected' : ''}`} aria-label={`${level.displayLabel} ${node.label ?? ''}`}>
      <div className="structured-heading">
        <button type="button" className="btn btn-sm" onClick={() => select(node.logicalId)} aria-pressed={selection === node.logicalId}>{level.displayLabel} {node.label}</button>
        {level.labelPolicy !== 'none' ? <label><T value={ui.editor.structurededitor.literalLabel} /><input aria-label={`${level.displayLabel} ${t(ui.editorDefaults.literalLabel)}`} value={node.label ?? ''} disabled={!editable} required={level.labelPolicy === 'required'} onChange={event => change({ type: 'set_metadata', targetId: node.logicalId, expectedRevisionId: token(node), label: event.target.value, title: node.title })} /></label> : null}
        {level.titlePolicy !== 'none' ? <label><T value={ui.editor.structurededitor.title} /><input aria-label={`${level.displayLabel} ${t(ui.editorDefaults.titleLabel)}`} value={node.title ?? ''} disabled={!editable} required={level.titlePolicy === 'required'} onChange={event => change({ type: 'set_metadata', targetId: node.logicalId, expectedRevisionId: token(node), title: event.target.value, label: node.label })} /></label> : null}
      </div>
      <div className={level.presentation === 'concatenated' ? 'sentence-canvas' : 'structured-content'}>
        {Array.from({ length: node.content.length + 1 }, (_, position) => <div key={position} className="structured-slot">
          {editable ? <div className="structured-insert" aria-label={t(ui.editorDefaults.insertPosition).replace('{position}', String(position + 1)).replace('{kind}', level.displayLabel)}>
            {level.mayHoldText ? <button type="button" onClick={() => change({ type: 'insert_text', targetId: node.logicalId, expectedRevisionId: token(node), position, parts: [{ logicalId: crypto.randomUUID(), text: '' }] })}>+ <T value={level.mayHoldChildren ? ui.editorDynamic.parentText : ui.editorDynamic.text} /></button> : null}
            {level.mayHoldText ? <button type="button" onClick={() => change({ type: 'insert_text', targetId: node.logicalId, expectedRevisionId: token(node), position, parts: [{ logicalId: crypto.randomUUID(), text: `${t(ui.editorDefaults.heading)}\n${t(ui.editorDefaults.value)}`, format: 'table', table: { caption: '', rows: [{ logicalId: crypto.randomUUID(), cells: [{ logicalId: crypto.randomUUID(), text: t(ui.editorDefaults.heading), header: true }] }, { logicalId: crypto.randomUUID(), cells: [{ logicalId: crypto.randomUUID(), text: t(ui.editorDefaults.value) }] }] } }] })}><T value={ui.editor.structurededitor.table} /></button> : null}
            {level.mayHoldText ? <button type="button" onClick={() => change({ type: 'insert_text', targetId: node.logicalId, expectedRevisionId: token(node), position, parts: [{ logicalId: crypto.randomUUID(), text: t(ui.editorDefaults.sourceNote), format: 'footnote', footnoteLabel: '1' }] })}><T value={ui.editor.structurededitor.footnote} /></button> : null}
            {level.allowedChildKinds.map(kindCode => <button key={kindCode} type="button" onClick={() => newChild(node, position, kindCode)}>+ {kindName(kindCode)}</button>)}
          </div> : null}
          {node.content[position] ? renderEntry(node.content[position], node, position, children) : null}
        </div>)}
      </div>
    </section>;
  }
  function renderEntry(entry: DraftEntry, parent: DraftNode, position: number, children: boolean): React.ReactNode {
    if (entry.node) return <div key={entry.node.logicalId}>{renderNode(entry.node)}{editable ? <div className="action-bar">
      <button type="button" disabled={position === 0} onClick={() => change({ type: 'move', targetId: entry.node!.logicalId, expectedRevisionId: token(entry.node!), destinationParentId: parent.logicalId, destinationRevisionId: token(parent), position: position - 1 })}><T value={ui.editor.structurededitor.moveUnitEarlier} /></button>
      <button type="button" disabled={position === parent.content.length - 1} onClick={() => change({ type: 'move', targetId: entry.node!.logicalId, expectedRevisionId: token(entry.node!), destinationParentId: parent.logicalId, destinationRevisionId: token(parent), position: position + 1 })}><T value={ui.editor.structurededitor.moveUnitLater} /></button>
      <button type="button" onClick={() => change({ type: 'remove', targetId: entry.node!.logicalId, expectedRevisionId: token(entry.node!) })}><T value={ui.editor.structurededitor.removeUnit} /></button>
    </div> : null}</div>;
    const level = outline.kinds.find(kind => kind.kindCode === parent.kind)!;
    const id = entry.logicalId!;
    const next = parent.content[position + 1];
    const format = entry.format ?? 'plain';
    const updateRich = (nextEntry: { text: string; format: DraftEntry['format']; table?: DraftEntry['table']; footnoteLabel?: string | null; references?: DraftEntry['references'] }) => change({ type: 'replace_text', targetId: id, expectedRevisionId: token(entry), ...nextEntry });
    const updateTable = (table: NonNullable<DraftEntry['table']>) => updateRich({ text: table.rows.map(row => row.cells.map(cell => cell.text).join(' ')).join('\n'), format: 'table', table });
    const updateCell = (cellId: string, patch: Partial<NonNullable<DraftEntry['table']>['rows'][number]['cells'][number]>) => {
      if (!entry.table) return;
      updateTable({ ...entry.table, rows: entry.table.rows.map(row => ({ ...row, cells: row.cells.map(cell => cell.logicalId === cellId ? { ...cell, ...patch } : cell) })) });
    };
    const addReference = (target: NonNullable<DraftEntry['references']>[number]['target']) => {
      const range = ranges.current[id];
      if (!range || range.start === range.end) { setMessage(t(ui.state.selectReferenceText)); return; }
      if (target.type === 'external' && !target.url?.startsWith('https://')) { setMessage(t(ui.state.referenceHttps)); return; }
      if (entry.references?.some(ref => range.start < ref.end && range.end > ref.start)) { setMessage(t(ui.state.referenceOverlap)); return; }
      updateRich({ text: entry.text ?? '', format: 'plain', references: [...(entry.references ?? []), { logicalId: crypto.randomUUID(), start: range.start, end: range.end, target }] });
    };
    const editText = (value: string) => {
      const old = entry.text ?? '';
      let prefix = 0; while (prefix < old.length && prefix < value.length && old[prefix] === value[prefix]) prefix++;
      let suffix = 0; while (suffix < old.length - prefix && suffix < value.length - prefix && old[old.length - 1 - suffix] === value[value.length - 1 - suffix]) suffix++;
      const oldEnd = old.length - suffix;
      const shift = value.length - old.length;
      const references = entry.references?.flatMap(ref => ref.end <= prefix ? [ref] : ref.start >= oldEnd ? [{ ...ref, start: ref.start + shift, end: ref.end + shift }] : []);
      updateRich({ text: value, format, footnoteLabel: entry.footnoteLabel, references });
    };
    function split(parts: string[]) {
      if (parts.length < 2 || parts.some(part => !part)) { setMessage(t(ui.state.splitCursor)); return; }
      transaction((emit, current) => {
        const identified = parts.map(text => ({ logicalId: crypto.randomUUID(), text }));
        const splitCommand = emit({ type: 'split_text', targetId: id, expectedRevisionId: token(entry), parts: identified });
        if (level.segmentation !== 'sentence' || level.mayHoldChildren || parent.content.length !== 1) return;
        const container = nodes(current()).find(node => node.content.some(item => item.node?.logicalId === parent.logicalId));
        for (let i = 1; i < identified.length; i++) {
          const child: DraftNode = { logicalId: crypto.randomUUID(), kind: parent.kind, label: level.labelPolicy === 'required' ? t(ui.editorDefaults.newLabel) : null, title: level.titlePolicy === 'required' ? t(ui.editorDefaults.newTitle) : null, content: [] };
          const currentContainer = container ? findNode(current(), container.logicalId)! : findNode(current(), parent.logicalId)!;
          const at = container ? currentContainer.content.findIndex(item => item.node?.logicalId === parent.logicalId) + i : current().findIndex(node => node.logicalId === parent.logicalId) + i;
          emit({ type: container ? 'insert_child' : 'insert_root', targetId: currentContainer.logicalId, expectedRevisionId: token(currentContainer), position: at, node: child });
          const inserted = findNode(current(), child.logicalId)!;
          emit({ type: 'move', targetId: identified[i].logicalId, expectedRevisionId: splitCommand.id, destinationParentId: inserted.logicalId, destinationRevisionId: token(inserted), position: 0 });
        }
      });
    }
    const container = allNodes.find(node => node.content.some(item => item.node?.logicalId === parent.logicalId));
    const siblingPosition = container?.content.findIndex(item => item.node?.logicalId === parent.logicalId) ?? -1;
    const nextSentence = container ? container.content[siblingPosition + 1]?.node : roots[roots.findIndex(node => node.logicalId === parent.logicalId) + 1];
    const canMergeSentence = level.segmentation === 'sentence' && parent.content.length === 1 && nextSentence?.kind === parent.kind && nextSentence.content.length === 1 && nextSentence.content[0].type === 'text' && !nextSentence.label && !nextSentence.title;
    function mergeSentence() {
      if (!canMergeSentence || !nextSentence) return;
      transaction((emit, current) => {
        const moved = nextSentence.content[0];
        emit({ type: 'move', targetId: moved.logicalId!, expectedRevisionId: token(moved), destinationParentId: parent.logicalId, destinationRevisionId: token(parent), position: 1 });
        const destination = findNode(current(), parent.logicalId)!;
        emit({ type: 'merge_text', targetId: id, expectedRevisionId: token(destination.content[0]), mergeIds: [id, moved.logicalId!], parts: [{ logicalId: crypto.randomUUID(), text: (entry.text ?? '') + (moved.text ?? '') }] });
        emit({ type: 'remove', targetId: nextSentence.logicalId, expectedRevisionId: token(findNode(current(), nextSentence.logicalId)!) });
      });
    }
    return <div className={`sentence-box ${selection === id ? 'is-selected' : ''}`} key={id}>
      {format === 'table' && entry.table ? <fieldset><legend><T value={ui.editor.structurededitor.table2} /></legend>
        <label><T value={ui.editor.structurededitor.caption} /><input value={entry.table.caption ?? ''} disabled={!editable} onChange={event => updateTable({ ...entry.table!, caption: event.target.value })} /></label>
        {entry.table.rows.map((row, rowIndex) => <div key={row.logicalId} className="action-bar" aria-label={`${t(ui.editorDefaults.tableRow)} ${rowIndex + 1}`}>
          {row.cells.map((cell, cellIndex) => <div key={cell.logicalId}>
            <label><T value={ui.editor.structurededitor.cell} />{" "}{cellIndex + 1}<textarea value={cell.text} disabled={!editable} onChange={event => updateCell(cell.logicalId, { text: event.target.value })} /></label>
            <label><T value={ui.editor.structurededitor.header} /><input type="checkbox" checked={cell.header ?? false} disabled={!editable} onChange={event => updateCell(cell.logicalId, { header: event.target.checked })} /></label>
            <label><T value={ui.editor.structurededitor.rowSpan} /><input type="number" min={1} max={100} value={cell.rowSpan ?? 1} disabled={!editable} onChange={event => updateCell(cell.logicalId, { rowSpan: Number(event.target.value) })} /></label>
            <label><T value={ui.editor.structurededitor.columnSpan} /><input type="number" min={1} max={100} value={cell.colSpan ?? 1} disabled={!editable} onChange={event => updateCell(cell.logicalId, { colSpan: Number(event.target.value) })} /></label>
            <label><T value={ui.editor.structurededitor.headerCells} /><select multiple value={cell.headers ?? []} disabled={!editable} onChange={event => updateCell(cell.logicalId, { headers: Array.from(event.target.selectedOptions, option => option.value) })}>{entry.table!.rows.flatMap(item => item.cells).filter(item => item.header && item.logicalId !== cell.logicalId).map(item => <option key={item.logicalId} value={item.logicalId}>{item.text || t(ui.editorDefaults.untitledHeader)}</option>)}</select></label>
          </div>)}
          {editable ? <button type="button" onClick={() => updateTable({ ...entry.table!, rows: entry.table!.rows.map((current, index) => index === rowIndex ? { ...current, cells: [...current.cells, { logicalId: crypto.randomUUID(), text: '' }] } : current) })}><T value={ui.editor.structurededitor.cell2} /></button> : null}
          {editable && entry.table!.rows.length > 1 ? <button type="button" onClick={() => updateTable({ ...entry.table!, rows: entry.table!.rows.filter((_, index) => index !== rowIndex) })}><T value={ui.editor.structurededitor.removeRow} /></button> : null}
        </div>)}
        {editable ? <button type="button" onClick={() => updateTable({ ...entry.table!, rows: [...entry.table!.rows, { logicalId: crypto.randomUUID(), cells: [{ logicalId: crypto.randomUUID(), text: '' }] }] })}><T value={ui.editor.structurededitor.row} /></button> : null}
      </fieldset> : <>
        {format === 'footnote' ? <label><T value={ui.editor.structurededitor.footnoteLabel} /><input value={entry.footnoteLabel ?? ''} disabled={!editable} onChange={event => updateRich({ text: entry.text ?? '', format: 'footnote', footnoteLabel: event.target.value })} /></label> : null}
        <label>{format === 'footnote' ? <T value={ui.editorDynamic.footnoteText} /> : children || level.mayHoldChildren ? <T value={ui.editorDynamic.unnumberedParentText} /> : <>{level.displayLabel} <T value={ui.editorDynamic.text} /></>}
          <textarea value={entry.text ?? ''} disabled={!editable} rows={2} onFocus={() => select(id)} onSelect={event => { caret.current[id] = event.currentTarget.selectionStart; ranges.current[id] = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd }; }} onChange={event => editText(event.target.value)} />
        </label>
      </>}
      {editable ? <div className="action-bar">
        {format === 'plain' && !entry.references?.length ? <button type="button" onClick={() => { const point = caret.current[id] ?? 0; split([(entry.text ?? '').slice(0, point), (entry.text ?? '').slice(point)]); }}><T value={ui.editor.structurededitor.splitAtCursor} /></button> : null}
        {format === 'plain' && !entry.references?.length && level.segmentation === 'sentence' && !level.mayHoldChildren ? <button type="button" onClick={() => split(sentenceParts(entry.text ?? ''))}><T value={ui.editor.structurededitor.suggestSentenceBoundaries} /></button> : null}
        <button type="button" disabled={format !== 'plain' || Boolean(entry.references?.length) || next?.type !== 'text' || Boolean(next.format && next.format !== 'plain') || Boolean(next.references?.length)} onClick={() => change({ type: 'merge_text', targetId: id, expectedRevisionId: token(entry), mergeIds: [id, next.logicalId!], parts: [{ logicalId: crypto.randomUUID(), text: (entry.text ?? '') + (next.text ?? '') }] })}><T value={ui.editor.structurededitor.mergeWithNext} /></button>
        {canMergeSentence ? <button type="button" onClick={mergeSentence}><T value={ui.editor.structurededitor.mergeWithNextSentence} /></button> : null}
        <button type="button" onClick={() => change({ type: 'remove', targetId: id, expectedRevisionId: token(entry) })}><T value={ui.editor.structurededitor.removeText} /></button>
      </div> : null}
        {format === 'plain' && editable ? <div className="action-bar"><label><T value={ui.editor.structurededitor.referenceTarget} /><select value={referenceTargets[id] ?? ''} onChange={event => setReferenceTargets(current => ({ ...current, [id]: event.target.value }))}><option value=""><T value={ui.editor.structurededitor.chooseATarget} /></option>{allNodes.map(node => <option key={node.logicalId} value={`unit:${node.logicalId}`}>{kindName(node.kind)} {node.label ?? node.title ?? node.logicalId}</option>)}{nodes(root ? [root] : []).flatMap(node => node.content).filter(item => item.format === 'footnote').map(item => <option key={item.logicalId} value={`footnote:${item.logicalId}`}><T value={ui.editor.structurededitor.footnote2} />{" "}{item.footnoteLabel ?? item.logicalId}</option>)}</select></label><button type="button" onClick={() => { const [type, logicalId] = (referenceTargets[id] ?? '').split(':'); if (!logicalId) { setMessage(t(ui.state.chooseReferenceTarget)); return; } addReference(type === 'footnote' ? { type: 'footnote', footnoteId: logicalId } : { type: 'unit', logicalId }); }}><T value={ui.editor.structurededitor.linkSelection} /></button><button type="button" onClick={() => { const url = window.prompt(t(ui.state.httpsReferenceUrl)); if (url) addReference({ type: 'external', url }); }}><T value={ui.editor.structurededitor.linkToUrl} /></button>{entry.references?.map(ref => <button key={ref.logicalId} type="button" onClick={() => updateRich({ text: entry.text ?? '', format: 'plain', references: entry.references?.filter(item => item.logicalId !== ref.logicalId) })}><T value={ui.editor.structurededitor.removeLink} />{" "}{(entry.text ?? '').slice(ref.start, ref.end)}</button>)}</div> : null}
    </div>;
  }
  const scopeIndex = outline.kinds.findIndex(kind => kind.kindCode === scope);
  const broad = isOverviewScope(scope);
  const selectedUnit = findNode(roots, selection) ?? allNodes.find(node => node.content.some(entry => entry.logicalId === selection)) ?? root;
  const navigationRoots = overviewRoots.length ? [...overviewRoots.filter(root => roots.some(current => current.logicalId === root.logicalId)).map(root => loadedRootIds.includes(root.logicalId) ? roots.find(current => current.logicalId === root.logicalId)! : root), ...roots.filter(root => !overviewRoots.some(item => item.logicalId === root.logicalId))] : roots;
  const focusedNodes = scopedNodes(roots, root?.logicalId ?? rootId, selection, scope);
  const rootKinds = outline.kinds.some(kind => kind.root) ? outline.kinds.filter(kind => kind.root) : outline.kinds.slice(0, 1);
  function reference(id: string, target: boolean) {
    const sourceRoot = sourceRoots.find(root => nodes([root]).some(node => node.logicalId === id || node.content.some(entry => entry.logicalId === id)));
    const targetRoot = roots.find(root => nodes([root]).some(node => node.logicalId === id || node.content.some(entry => entry.logicalId === id)));
    const sourceUnit = sourceRoot && (findNode([sourceRoot], id) ?? nodes([sourceRoot]).flatMap(node => node.content).find(entry => entry.logicalId === id));
    const version = target ? publishedVersionId : preview.sourceVersionId;
    const rootOccurrence = target ? targetRoot && unitMapping?.[targetRoot.logicalId] : sourceRoot?.occurrenceId;
    const occurrence = target ? unitMapping?.[id] : sourceUnit?.occurrenceId;
    return version && rootOccurrence ? `/versions/${encodeURIComponent(version)}/units/${encodeURIComponent(rootOccurrence)}${occurrence ? `?occurrenceId=${encodeURIComponent(occurrence)}` : ''}` : undefined;
  }
  return <Stack as="form" action="/editor/command" method="post" id="draft-form" onSubmit={() => { saving.current = true; }}>
    <input type="hidden" name="command" value="structured-save" /><input type="hidden" name="sessionId" value={preview.sessionId} /><input type="hidden" name="versionId" value={versionId} /><input type="hidden" name="articleId" value={articleId} />
    <input type="hidden" name="scope" value={scope} /><input type="hidden" name="selectedNode" value={selection} /><input type="hidden" name="structuredDraft" value={JSON.stringify({ expectedGeneration: preview.generation, operations })} />
    <div className="action-bar"><label><T value={ui.editor.structurededitor.editorView} /><select value={scope} disabled={loading} onChange={event => changeScope(event.target.value)}><option value="constitution"><T value={ui.editor.structurededitor.constitution} /></option>{outline.kinds.map(kind => <option key={kind.kindCode} value={kind.kindCode}>{kind.displayLabel}</option>)}</select></label>{canManageStructure ? <a href={`/admin/constitutions/${constitutionId}`}><T value={ui.editor.structurededitor.constitutionStructureSettings} /></a> : null}</div>
    <p role="status">{loading ? <T value={ui.editorDynamic.loadingEditor} /> : message || <T value={preview.operations.length ? ui.editor.structurededitor.savedDraft : ui.editor.structurededitor.sourceSnapshot} />}</p>
    {errors.length ? <div role="alert"><p><T value={ui.editor.structurededitor.resolveTheseIssuesBeforeSavingOrReview} /></p><ul>{errors.map(error => <li key={error}>{error}</li>)}</ul></div> : null}
    <aside aria-label={t(ui.accessibility.selectionInspector)}><p><T value={ui.editor.structurededitor.selected} />{" "}{selectedUnit?.kind ? kindName(selectedUnit.kind) : ''} {selectedUnit?.label} {selection !== selectedUnit?.logicalId ? <T value={ui.remainingStatus.unnumberedParentText} /> : ''}</p></aside>
    {broad ? <ul>{nodes(navigationRoots).filter(node => scope === 'constitution' ? roots.some(root => root.logicalId === node.logicalId) : node.kind === scope).map(node => <li key={node.logicalId}><button type="button" disabled={loading} onClick={() => { const nextScope = node.kind; const selectedRoot = navigationRoots.find(root => nodes([root]).some(child => child.logicalId === node.logicalId)); if (selectedRoot && !loadedRootIds.includes(selectedRoot.logicalId) && sourceRoots.some(root => root.logicalId === selectedRoot.logicalId)) void loadView(nextScope, node.logicalId, selectedRoot.logicalId); else { select(node.logicalId); setScope(nextScope); remember(nextScope, node.logicalId); } }}>{kindName(node.kind)} {node.label} {node.title}</button></li>)}</ul> : focusedNodes.length ? focusedNodes.map(node => renderNode(node)) : <p><T value={ui.editor.structurededitor.no} />{" "}{outline.kinds[scopeIndex]?.displayLabel} <T value={ui.editor.structurededitor.unitsInThisSelectionAddAChild} /></p>}
    {editable && root ? <div className="action-bar" aria-label={t(ui.accessibility.topLevelUnitActions)}>
      {rootKinds.map(kind => <button key={kind.kindCode} type="button" onClick={() => change({ type: 'insert_root', targetId: root.logicalId, expectedRevisionId: token(root), position: roots.indexOf(root) + 1, node: createNode(kind.kindCode) })}>{rootKinds.length === 1 ? <T value={ui.editorDynamic.addTopLevelUnit} /> : <><T value={ui.editorDynamic.add} /> {kind.displayLabel}</>}</button>)}
      <button type="button" disabled={roots.indexOf(root) === 0} onClick={() => change({ type: 'move_root', targetId: root.logicalId, expectedRevisionId: token(root), position: roots.indexOf(root) - 1 })}><T value={ui.editor.structurededitor.moveTopLevelUnitEarlier} /></button>
      <button type="button" disabled={roots.length < 2} onClick={() => change({ type: 'remove', targetId: root.logicalId, expectedRevisionId: token(root) })}><T value={ui.editor.structurededitor.removeTopLevelUnit} /></button>
    </div> : null}
    {editable ? <div className="action-bar"><Button variant="primary" disabled={loading || !operations.length || errors.length > 0}><T value={ui.editor.structurededitor.saveDraft} /></Button><button type="button" disabled={!history.length} onClick={undo}><T value={ui.editor.structurededitor.undo} /></button></div> : null}
    <details open={!editable}><summary><T value={ui.editor.structurededitor.entryLevelReview} />{differences.length} <T value={ui.editor.structurededitor.changes} /></summary>{differences.length ? <ol>{differences.map((difference, index) => <li key={index}><strong>{t(differenceField(difference.field))}</strong><div><del>{difference.before}</del> → <ins>{difference.after}</ins></div><div>{(difference.sourceLink ?? reference(difference.logicalId, false)) ? <a href={difference.sourceLink ?? reference(difference.logicalId, false)}><T value={ui.editor.structurededitor.sourceSnapshot} /></a> : null} {(difference.targetLink ?? reference(difference.logicalId, true)) ? <a href={difference.targetLink ?? reference(difference.logicalId, true)}><T value={ui.editor.structurededitor.publishedSuccessor} /></a> : null}</div><details><summary><T value={ui.editor.structurededitor.revisionDetails} /></summary><small><T value={ui.editor.structurededitor.unit} />{" "}{difference.logicalId} <T value={ui.editor.structurededitor.sourceRevision} />{" "}{difference.sourceRevisionId ?? t(ui.remainingStatus.new)} <T value={ui.editor.structurededitor.target} />{" "}{difference.targetRevisionId ?? t(ui.editor.publishform.removed)}</small></details></li>)}</ol> : <p><T value={ui.editor.structurededitor.noChanges} /></p>}</details>
  </Stack>;
}
