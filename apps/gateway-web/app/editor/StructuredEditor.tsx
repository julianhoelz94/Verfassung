'use client';
import { useRef, useState } from 'react';
import type { ContentOutline } from '../../lib/api';
import { applyOperation, draftDifferences, findNode, nodes, sentenceParts, token, validateDraft, type DraftEntry, type DraftNode, type DraftOperation, type StructuredPreview } from '../../lib/structured-editor';
import { Button } from '../components/ui';

type Props = { preview: StructuredPreview; outline: ContentOutline; rootId: string; versionId: string; articleId: string; constitutionId: string; editable: boolean; scope?: string; selectedNode?: string };
export function StructuredEditor({ preview, outline, rootId, versionId, articleId, constitutionId, editable, scope: initialScope, selectedNode }: Props) {
  const [roots, setRoots] = useState(preview.roots);
  const [operations, setOperations] = useState<DraftOperation[]>([]);
  const [history, setHistory] = useState<{ roots: DraftNode[]; operations: DraftOperation[] }[]>([]);
  const [selection, setSelection] = useState(selectedNode ?? rootId);
  const defaultScope = outline.kinds.find(kind => kind.kindCode === 'article')?.kindCode ?? outline.kinds[0].kindCode;
  const [scope, setScope] = useState(initialScope === 'constitution' || outline.kinds.some(kind => kind.kindCode === initialScope) ? initialScope! : defaultScope);
  const [message, setMessage] = useState('');
  const caret = useRef<Record<string, number>>({});
  const allNodes = nodes(roots);
  const root = findNode(roots, rootId);
  const errors = validateDraft(roots, outline);
  const differences = draftDifferences(preview.sourceRoots, roots);
  function remember(view: string, selected: string) {
    const url = new URL(window.location.href); url.searchParams.set('scope', view); url.searchParams.set('selectedNode', selected); window.history.replaceState(null, '', url);
  }
  function select(id: string) { setSelection(id); remember(scope, id); }
  function change(op: Omit<DraftOperation, 'id'>) {
    try {
      const previous = operations.at(-1);
      const coalesce = previous && previous.targetId === op.targetId && previous.type === op.type && ['replace_text', 'set_metadata'].includes(op.type);
      const command = coalesce ? { ...op, id: previous.id, expectedRevisionId: previous.expectedRevisionId } : { ...op, id: crypto.randomUUID() };
      const next = applyOperation(roots, command);
      setHistory([...history, { roots, operations }]); setRoots(next); setOperations(coalesce ? [...operations.slice(0, -1), command] : [...operations, command]); setMessage('Unsaved changes');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Invalid change'); }
  }
  function undo() {
    const previous = history.at(-1); if (!previous) return;
    setRoots(previous.roots); setOperations(previous.operations); setHistory(history.slice(0, -1)); setMessage('Last change undone');
  }
  function newChild(parent: DraftNode, position: number) {
    const depth = outline.kinds.findIndex(kind => kind.kindCode === parent.kind);
    function create(index: number): DraftNode {
      const level = outline.kinds[index];
      return { logicalId: crypto.randomUUID(), kind: level.kindCode, label: level.labelPolicy === 'required' ? 'New label' : null, title: level.titlePolicy === 'required' ? 'New title' : null, content: level.mayHoldChildren ? [{ type: 'child', node: create(index + 1) }] : [{ type: 'text', logicalId: crypto.randomUUID(), text: '' }] };
    }
    change({ type: 'insert_child', targetId: parent.logicalId, expectedRevisionId: token(parent), position, node: create(depth + 1) });
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
    if (entry.node) return renderNode(entry.node);
    const level = outline.kinds.find(kind => kind.kindCode === parent.kind)!;
    const id = entry.logicalId!;
    const next = parent.content[position + 1];
    function split(parts: string[]) { if (parts.length < 2 || parts.some(part => !part)) { setMessage('Place the cursor inside the text to split it.'); return; } change({ type: 'split_text', targetId: id, expectedRevisionId: token(entry), parts: parts.map(text => ({ logicalId: crypto.randomUUID(), text })) }); }
    return <div className={`sentence-box ${selection === id ? 'is-selected' : ''}`} key={id}>
      <label>{children || level.mayHoldChildren ? 'Unnumbered parent text' : `${level.displayLabel} text`}
        <textarea value={entry.text ?? ''} disabled={!editable} rows={2} onFocus={() => select(id)} onSelect={event => { caret.current[id] = event.currentTarget.selectionStart; }} onChange={event => change({ type: 'replace_text', targetId: id, expectedRevisionId: token(entry), text: event.target.value })} />
      </label>
      {editable ? <div className="action-bar">
        <button type="button" onClick={() => { const point = caret.current[id] ?? 0; split([(entry.text ?? '').slice(0, point), (entry.text ?? '').slice(point)]); }}>Split at cursor</button>
        {level.segmentation === 'sentence' && !level.mayHoldChildren ? <button type="button" onClick={() => split(sentenceParts(entry.text ?? ''))}>Suggest sentence boundaries</button> : null}
        <button type="button" disabled={next?.type !== 'text'} onClick={() => change({ type: 'merge_text', targetId: id, expectedRevisionId: token(entry), mergeIds: [id, next.logicalId!], parts: [{ logicalId: crypto.randomUUID(), text: (entry.text ?? '') + (next.text ?? '') }] })}>Merge with next</button>
        <button type="button" onClick={() => change({ type: 'remove', targetId: id, expectedRevisionId: token(entry) })}>Remove text</button>
      </div> : null}
    </div>;
  }
  const scopeIndex = outline.kinds.findIndex(kind => kind.kindCode === scope);
  const articleIndex = outline.kinds.findIndex(kind => kind.kindCode === 'article');
  const broad = scope === 'constitution' || (articleIndex >= 0 && scopeIndex < articleIndex);
  const selectedUnit = findNode(roots, selection) ?? allNodes.find(node => node.content.some(entry => entry.logicalId === selection)) ?? root;
  const focusNode = allNodes.find(node => node.kind === scope && (node.logicalId === selection || nodes([node]).some(child => child.logicalId === selectedUnit?.logicalId))) ?? root;
  return <form action="/editor/command" method="post" id="draft-form">
    <input type="hidden" name="command" value="structured-save" /><input type="hidden" name="sessionId" value={preview.sessionId} /><input type="hidden" name="versionId" value={versionId} /><input type="hidden" name="articleId" value={articleId} />
    <input type="hidden" name="scope" value={scope} /><input type="hidden" name="selectedNode" value={selection} /><input type="hidden" name="structuredDraft" value={JSON.stringify({ expectedGeneration: preview.generation, operations })} />
    <div className="action-bar"><label>Editor view<select value={scope} onChange={event => { setScope(event.target.value); remember(event.target.value, selection); }}><option value="constitution">Constitution</option>{outline.kinds.map(kind => <option key={kind.kindCode} value={kind.kindCode}>{kind.displayLabel}</option>)}</select></label><a href={`/admin/constitutions/${constitutionId}`}>Constitution structure settings</a></div>
    <p role="status">{message || (preview.operations.length ? 'Saved draft' : 'Source snapshot')}</p>
    {errors.length ? <div role="alert"><p>Resolve these issues before saving or review:</p><ul>{errors.map(error => <li key={error}>{error}</li>)}</ul></div> : null}
    <aside aria-label="Selection inspector"><p>Selected: {selectedUnit?.kind} {selectedUnit?.label} {selection !== selectedUnit?.logicalId ? '· Unnumbered parent text' : ''}</p></aside>
    {broad ? <ul>{allNodes.filter(node => scope === 'constitution' ? preview.roots.some(root => root.logicalId === node.logicalId) : node.kind === scope).map(node => <li key={node.logicalId}><button type="button" onClick={() => { select(node.logicalId); setScope(defaultScope); remember(defaultScope, node.logicalId); }}>{node.kind} {node.label} {node.title}</button></li>)}</ul> : focusNode ? renderNode(focusNode) : null}
    {editable ? <div className="action-bar"><Button variant="primary" disabled={!operations.length || errors.length > 0}>Save draft</Button><button type="button" disabled={!history.length} onClick={undo}>Undo</button></div> : null}
    <details open={!editable}><summary>Entry-level review ({differences.length} changes)</summary>{differences.length ? <ol>{differences.map((difference, index) => <li key={index}><strong>{difference.field}</strong> · <code>{difference.logicalId}</code><div><del>{difference.before}</del> → <ins>{difference.after}</ins></div><small>Source revision: {difference.sourceRevisionId ?? 'new'} · Target: {difference.targetRevisionId ?? 'removed'}</small></li>)}</ol> : <p>No changes.</p>}</details>
  </form>;
}
