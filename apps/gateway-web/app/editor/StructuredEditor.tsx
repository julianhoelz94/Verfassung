'use client';
import { useEffect, useRef, useState } from 'react';
import type { ContentOutline } from '../../lib/api';
import { applyOperation, draftDifferences, findNode, nodes, scopedNodes, sentenceParts, token, validateDraft, type DraftEntry, type DraftNode, type DraftOperation, type StructuredPreview } from '../../lib/structured-editor';
import { useDraftState } from './EditorDraftState';
import { Button } from '../components/ui';

type Props = { preview: StructuredPreview; outline: ContentOutline; rootId: string; versionId: string; articleId: string; constitutionId: string; editable: boolean; scope?: string; selectedNode?: string; publishedVersionId?: string | null; unitMapping?: Record<string, string> | null };
export function StructuredEditor({ preview, outline, rootId, versionId, articleId, constitutionId, editable, scope: initialScope, selectedNode, publishedVersionId, unitMapping }: Props) {
  const [roots, setRoots] = useState(preview.roots);
  const [operations, setOperations] = useState<DraftOperation[]>([]);
  const [history, setHistory] = useState<{ roots: DraftNode[]; operations: DraftOperation[] }[]>([]);
  const [selection, setSelection] = useState(selectedNode ?? rootId);
  const defaultScope = outline.kinds.find(kind => kind.kindCode === 'article')?.kindCode ?? outline.kinds[0].kindCode;
  const [scope, setScope] = useState(initialScope === 'constitution' || outline.kinds.some(kind => kind.kindCode === initialScope) ? initialScope! : defaultScope);
  const [message, setMessage] = useState('');
  const { setDirty } = useDraftState();
  useEffect(() => { setDirty(operations.length > 0); return () => setDirty(false); }, [operations.length, setDirty]);
  useEffect(() => {
    function guard(event: BeforeUnloadEvent) { if (operations.length) { event.preventDefault(); event.returnValue = ''; } }
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [operations.length]);
  const caret = useRef<Record<string, number>>({});
  const allNodes = nodes(roots);
  const root = roots.find(root => nodes([root]).some(node => node.logicalId === selection || node.content.some(entry => entry.logicalId === selection))) ?? findNode(roots, rootId) ?? roots[0];
  const errors = validateDraft(roots, outline);
  const differences = draftDifferences(preview.sourceRoots, roots);
  function remember(view: string, selected: string) {
    const url = new URL(window.location.href); url.searchParams.set('scope', view); url.searchParams.set('selectedNode', selected); window.history.replaceState(null, '', url);
  }
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
      setHistory([...history, { roots, operations }]); setRoots(nextRoots); setOperations(nextOperations); setMessage('Unsaved changes');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Invalid change'); }
  }
  function change(op: Omit<DraftOperation, 'id'>) { transaction(emit => { emit(op); }); }
  function undo() {
    const previous = history.at(-1); if (!previous) return;
    setRoots(previous.roots); setOperations(previous.operations); setHistory(history.slice(0, -1)); setMessage('Last change undone');
  }
  function createNode(index: number): DraftNode {
      const level = outline.kinds[index];
      return { logicalId: crypto.randomUUID(), kind: level.kindCode, label: level.labelPolicy === 'required' ? 'New label' : null, title: level.titlePolicy === 'required' ? 'New title' : null, content: level.mayHoldChildren ? [{ type: 'child', node: createNode(index + 1) }] : [{ type: 'text', logicalId: crypto.randomUUID(), text: '' }] };
  }
  function newChild(parent: DraftNode, position: number) {
    const depth = outline.kinds.findIndex(kind => kind.kindCode === parent.kind);
    change({ type: 'insert_child', targetId: parent.logicalId, expectedRevisionId: token(parent), position, node: createNode(depth + 1) });
  }
  function renderNode(node: DraftNode): React.ReactNode {
    const level = outline.kinds.find(kind => kind.kindCode === node.kind)!;
    const children = node.content.some(entry => entry.node);
    return <section key={node.logicalId} className={`structured-unit ${selection === node.logicalId ? 'is-selected' : ''}`} aria-label={`${level.displayLabel} ${node.label ?? ''}`}>
      <div className="structured-heading">
        <button type="button" className="btn btn-sm" onClick={() => select(node.logicalId)} aria-pressed={selection === node.logicalId}>{level.displayLabel} {node.label}</button>
        {level.labelPolicy !== 'none' ? <label>Literal label<input aria-label={`${level.displayLabel} literal label`} value={node.label ?? ''} disabled={!editable} required={level.labelPolicy === 'required'} onChange={event => change({ type: 'set_metadata', targetId: node.logicalId, expectedRevisionId: token(node), label: event.target.value, title: node.title })} /></label> : null}
        {level.titlePolicy !== 'none' ? <label>Title<input aria-label={`${level.displayLabel} title`} value={node.title ?? ''} disabled={!editable} required={level.titlePolicy === 'required'} onChange={event => change({ type: 'set_metadata', targetId: node.logicalId, expectedRevisionId: token(node), title: event.target.value, label: node.label })} /></label> : null}
      </div>
      <div className={level.presentation === 'concatenated' ? 'sentence-canvas' : 'structured-content'}>
        {Array.from({ length: node.content.length + 1 }, (_, position) => <div key={position} className="structured-slot">
          {editable ? <div className="structured-insert" aria-label={`Insert at position ${position + 1} in ${level.displayLabel}`}>
            {level.mayHoldText ? <button type="button" onClick={() => change({ type: 'insert_text', targetId: node.logicalId, expectedRevisionId: token(node), position, parts: [{ logicalId: crypto.randomUUID(), text: '' }] })}>+ {level.mayHoldChildren ? 'Parent text' : 'Text'}</button> : null}
            {level.mayHoldChildren ? <button type="button" onClick={() => newChild(node, position)}>+ {outline.kinds[outline.kinds.findIndex(kind => kind.kindCode === node.kind) + 1]?.displayLabel ?? 'Child unit'}</button> : null}
          </div> : null}
          {node.content[position] ? renderEntry(node.content[position], node, position, children) : null}
        </div>)}
      </div>
    </section>;
  }
  function renderEntry(entry: DraftEntry, parent: DraftNode, position: number, children: boolean): React.ReactNode {
    if (entry.node) return <div key={entry.node.logicalId}>{renderNode(entry.node)}{editable ? <div className="action-bar">
      <button type="button" disabled={position === 0} onClick={() => change({ type: 'move', targetId: entry.node!.logicalId, expectedRevisionId: token(entry.node!), destinationParentId: parent.logicalId, destinationRevisionId: token(parent), position: position - 1 })}>Move unit earlier</button>
      <button type="button" disabled={position === parent.content.length - 1} onClick={() => change({ type: 'move', targetId: entry.node!.logicalId, expectedRevisionId: token(entry.node!), destinationParentId: parent.logicalId, destinationRevisionId: token(parent), position: position + 1 })}>Move unit later</button>
      <button type="button" onClick={() => change({ type: 'remove', targetId: entry.node!.logicalId, expectedRevisionId: token(entry.node!) })}>Remove unit</button>
    </div> : null}</div>;
    const level = outline.kinds.find(kind => kind.kindCode === parent.kind)!;
    const id = entry.logicalId!;
    const next = parent.content[position + 1];
    function split(parts: string[]) {
      if (parts.length < 2 || parts.some(part => !part)) { setMessage('Place the cursor inside the text to split it.'); return; }
      transaction((emit, current) => {
        const identified = parts.map(text => ({ logicalId: crypto.randomUUID(), text }));
        const splitCommand = emit({ type: 'split_text', targetId: id, expectedRevisionId: token(entry), parts: identified });
        if (level.segmentation !== 'sentence' || level.mayHoldChildren || parent.content.length !== 1) return;
        const container = nodes(current()).find(node => node.content.some(item => item.node?.logicalId === parent.logicalId));
        for (let i = 1; i < identified.length; i++) {
          const child: DraftNode = { logicalId: crypto.randomUUID(), kind: parent.kind, label: level.labelPolicy === 'required' ? 'New label' : null, title: level.titlePolicy === 'required' ? 'New title' : null, content: [] };
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
    const nextSentence = container?.content[siblingPosition + 1]?.node;
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
      <label>{children || level.mayHoldChildren ? 'Unnumbered parent text' : `${level.displayLabel} text`}
        <textarea value={entry.text ?? ''} disabled={!editable} rows={2} onFocus={() => select(id)} onSelect={event => { caret.current[id] = event.currentTarget.selectionStart; }} onChange={event => change({ type: 'replace_text', targetId: id, expectedRevisionId: token(entry), text: event.target.value })} />
      </label>
      {editable ? <div className="action-bar">
        <button type="button" onClick={() => { const point = caret.current[id] ?? 0; split([(entry.text ?? '').slice(0, point), (entry.text ?? '').slice(point)]); }}>Split at cursor</button>
        {level.segmentation === 'sentence' && !level.mayHoldChildren ? <button type="button" onClick={() => split(sentenceParts(entry.text ?? ''))}>Suggest sentence boundaries</button> : null}
        <button type="button" disabled={next?.type !== 'text'} onClick={() => change({ type: 'merge_text', targetId: id, expectedRevisionId: token(entry), mergeIds: [id, next.logicalId!], parts: [{ logicalId: crypto.randomUUID(), text: (entry.text ?? '') + (next.text ?? '') }] })}>Merge with next</button>
        {canMergeSentence ? <button type="button" onClick={mergeSentence}>Merge with next sentence</button> : null}
        <button type="button" onClick={() => change({ type: 'remove', targetId: id, expectedRevisionId: token(entry) })}>Remove text</button>
      </div> : null}
    </div>;
  }
  const scopeIndex = outline.kinds.findIndex(kind => kind.kindCode === scope);
  const articleIndex = outline.kinds.findIndex(kind => kind.kindCode === 'article');
  const broad = scope === 'constitution' || (articleIndex >= 0 && scopeIndex < articleIndex);
  const selectedUnit = findNode(roots, selection) ?? allNodes.find(node => node.content.some(entry => entry.logicalId === selection)) ?? root;
  const focusedNodes = scopedNodes(roots, root?.logicalId ?? rootId, selection, scope);
  function reference(id: string, target: boolean) {
    const sourceRoot = preview.sourceRoots.find(root => nodes([root]).some(node => node.logicalId === id || node.content.some(entry => entry.logicalId === id)));
    const targetRoot = roots.find(root => nodes([root]).some(node => node.logicalId === id || node.content.some(entry => entry.logicalId === id)));
    const sourceUnit = sourceRoot && (findNode([sourceRoot], id) ?? nodes([sourceRoot]).flatMap(node => node.content).find(entry => entry.logicalId === id));
    const version = target ? publishedVersionId : preview.sourceVersionId;
    const rootOccurrence = target ? targetRoot && unitMapping?.[targetRoot.logicalId] : sourceRoot?.occurrenceId;
    const occurrence = target ? unitMapping?.[id] : sourceUnit?.occurrenceId;
    return version && rootOccurrence ? `/versions/${encodeURIComponent(version)}/units/${encodeURIComponent(rootOccurrence)}${occurrence ? `?occurrenceId=${encodeURIComponent(occurrence)}` : ''}` : undefined;
  }
  return <form action="/editor/command" method="post" id="draft-form">
    <input type="hidden" name="command" value="structured-save" /><input type="hidden" name="sessionId" value={preview.sessionId} /><input type="hidden" name="versionId" value={versionId} /><input type="hidden" name="articleId" value={articleId} />
    <input type="hidden" name="scope" value={scope} /><input type="hidden" name="selectedNode" value={selection} /><input type="hidden" name="structuredDraft" value={JSON.stringify({ expectedGeneration: preview.generation, operations })} />
    <div className="action-bar"><label>Editor view<select value={scope} onChange={event => { setScope(event.target.value); remember(event.target.value, selection); }}><option value="constitution">Constitution</option>{outline.kinds.map(kind => <option key={kind.kindCode} value={kind.kindCode}>{kind.displayLabel}</option>)}</select></label><a href={`/admin/constitutions/${constitutionId}`}>Constitution structure settings</a></div>
    <p role="status">{message || (preview.operations.length ? 'Saved draft' : 'Source snapshot')}</p>
    {errors.length ? <div role="alert"><p>Resolve these issues before saving or review:</p><ul>{errors.map(error => <li key={error}>{error}</li>)}</ul></div> : null}
    <aside aria-label="Selection inspector"><p>Selected: {selectedUnit?.kind} {selectedUnit?.label} {selection !== selectedUnit?.logicalId ? '· Unnumbered parent text' : ''}</p></aside>
    {broad ? <ul>{allNodes.filter(node => scope === 'constitution' ? roots.some(root => root.logicalId === node.logicalId) : node.kind === scope).map(node => <li key={node.logicalId}><button type="button" onClick={() => { select(node.logicalId); const nextScope = outline.kinds[Math.min(outline.kinds.findIndex(kind => kind.kindCode === node.kind) + 1, outline.kinds.length - 1)].kindCode; setScope(nextScope); remember(nextScope, node.logicalId); }}>{node.kind} {node.label} {node.title}</button></li>)}</ul> : focusedNodes.length ? focusedNodes.map(node => renderNode(node)) : <p>No {outline.kinds[scopeIndex]?.displayLabel} units in this selection. Add a child in the broader view.</p>}
    {editable && root ? <div className="action-bar" aria-label="Top-level unit actions">
      <button type="button" onClick={() => change({ type: 'insert_root', targetId: root.logicalId, expectedRevisionId: token(root), position: roots.indexOf(root) + 1, node: createNode(0) })}>Add top-level unit</button>
      <button type="button" disabled={roots.indexOf(root) === 0} onClick={() => change({ type: 'move_root', targetId: root.logicalId, expectedRevisionId: token(root), position: roots.indexOf(root) - 1 })}>Move top-level unit earlier</button>
      <button type="button" disabled={roots.length < 2} onClick={() => change({ type: 'remove', targetId: root.logicalId, expectedRevisionId: token(root) })}>Remove top-level unit</button>
    </div> : null}
    {editable ? <div className="action-bar"><Button variant="primary" disabled={!operations.length || errors.length > 0}>Save draft</Button><button type="button" disabled={!history.length} onClick={undo}>Undo</button></div> : null}
    <details open={!editable}><summary>Entry-level review ({differences.length} changes)</summary>{differences.length ? <ol>{differences.map((difference, index) => <li key={index}><strong>{difference.field}</strong><div><del>{difference.before}</del> → <ins>{difference.after}</ins></div><div>{reference(difference.logicalId, false) ? <a href={reference(difference.logicalId, false)}>Source snapshot</a> : null} {reference(difference.logicalId, true) ? <a href={reference(difference.logicalId, true)}>Published successor</a> : null}</div><details><summary>Revision details</summary><small>Unit: {difference.logicalId} · Source revision: {difference.sourceRevisionId ?? 'new'} · Target: {difference.targetRevisionId ?? 'removed'}</small></details></li>)}</ol> : <p>No changes.</p>}</details>
  </form>;
}
