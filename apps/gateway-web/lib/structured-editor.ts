import type { ContentOutline } from './api';
import { normalizeMarks, sliceBlock } from './continuous-editor';
import { ui, type UiMessage } from './messages';

export type DraftEntry = { occurrenceId?: string | null; type: 'text' | 'child'; node?: DraftNode | null; logicalId?: string | null; revisionId?: string | null; draftId?: string | null; text?: string | null; format?: 'plain' | 'table' | 'footnote' | null; table?: import('./api').OrderedTable | null; footnoteLabel?: string | null; lineBreaksBefore?: number; references?: import('./api').OrderedInlineReference[]; marks?: import('./api').OrderedTextMark[]; annotation?: import('./api').OrderedEntry['annotation'] };
export type DraftNode = { occurrenceId?: string | null; logicalId: string; revisionId?: string | null; draftId?: string | null; kind: string; label?: string | null; title?: string | null; content: DraftEntry[] };
export type DraftOperation = { id: string; type: string; targetId: string; expectedRevisionId: string; text?: string; title?: string | null; label?: string | null; position?: number; destinationParentId?: string; destinationRevisionId?: string; replacementId?: string; parts?: { logicalId: string; text: string; format?: DraftEntry['format']; table?: DraftEntry['table']; footnoteLabel?: string | null; annotation?: DraftEntry['annotation']; references?: DraftEntry['references']; lineBreaksBefore?: number; marks?: DraftEntry['marks'] }[]; mergeIds?: string[]; node?: DraftNode; format?: DraftEntry['format']; table?: DraftEntry['table']; footnoteLabel?: string | null; annotation?: DraftEntry['annotation']; references?: DraftEntry['references']; lineBreaksBefore?: number; marks?: DraftEntry['marks'] };
export type StructuredPreview = { sessionId: string; sourceVersionId: string; sourceGeneration: number; settingsRevisionId: string; generation: number; roots: DraftNode[]; sourceRoots: DraftNode[]; operations: DraftOperation[]; footnotes?: { entry: DraftEntry; parentId: string; rootId: string }[]; footnoteReferences?: { noteId: string; rootId: string; parentId: string; entryId: string; referenceId?:string }[] };
export function token(unit: DraftNode | DraftEntry): string { return unit.draftId ?? unit.revisionId ?? ''; }
export function nodes(roots: DraftNode[]): DraftNode[] { return roots.flatMap(node => [node, ...nodes(node.content.flatMap(entry => entry.node ? [entry.node] : []))]); }
export function findNode(roots: DraftNode[], id: string): DraftNode | undefined { return nodes(roots).find(node => node.logicalId === id); }

/** Local replay of the targeted command contract. Server replay remains authoritative. */
export function applyOperation(roots: DraftNode[], op: DraftOperation): DraftNode[] {
  const invalidLayout=(value:number|undefined)=>value!==undefined&&(!Number.isInteger(value)||value<0||value>16);
  if(invalidLayout(op.lineBreaksBefore)||op.parts?.some(part=>invalidLayout(part.lineBreaksBefore))||op.type==='replace_text'&&op.lineBreaksBefore!==undefined&&op.format===undefined)throw new Error('Line-break layout requires a valid rich-text replacement.');
  if (op.type === 'insert_root') return [...roots.slice(0, op.position), markInserted(op.node!, op.id), ...roots.slice(op.position)];
  if (op.type === 'move_root') {
    const root = roots.find(node => node.logicalId === op.targetId)!;
    const retained = roots.filter(node => node.logicalId !== op.targetId);
    return [...retained.slice(0, op.position), root, ...retained.slice(op.position)];
  }
  if (op.type === 'move') {
    const parent = nodes(roots).find(node => node.content.some(entry => entry.logicalId === op.targetId || entry.node?.logicalId === op.targetId));
    const entry = parent?.content.find(entry => entry.logicalId === op.targetId || entry.node?.logicalId === op.targetId);
    if (!entry) throw new Error('Move requires an entry under a parent.');
    const retained = applyOperation(roots, { ...op, type: 'remove' });
    function insert(node: DraftNode): DraftNode {
      const content = node.content.map(item => item.node ? { ...item, node: insert(item.node) } : item);
      return node.logicalId === op.destinationParentId ? { ...node, draftId: op.id, content: [...content.slice(0, op.position), entry!, ...content.slice(op.position)] } : { ...node, content };
    }
    return retained.map(insert);
  }
  function walk(node: DraftNode): DraftNode {
    let content = node.content.map(entry => entry.node ? { ...entry, node: walk(entry.node) } : entry);
    let result = { ...node, content };
    if (node.logicalId === op.targetId) {
      if (op.type === 'set_metadata') result = { ...result, title: op.title, label: op.label, draftId: op.id };
      if (op.type === 'insert_text' || op.type === 'insert_child') {
        const entry: DraftEntry = op.type === 'insert_text' ? { type: 'text', ...op.parts![0], draftId: op.id } : { type: 'child', node: markInserted(op.node!, op.id) };
        content = [...content.slice(0, op.position), entry, ...content.slice(op.position)];
        result = { ...result, content, draftId: op.id };
      }
    }
    const index = content.findIndex(entry => entry.logicalId === op.targetId || entry.node?.logicalId === op.targetId);
    if (index >= 0) {
      const entry = content[index];
      if (op.type === 'replace_text') content = content.map((item, i) => i === index ? { ...item, text: op.text, draftId: op.id, ...(op.format === undefined ? {} : { format: op.format, table: op.table, footnoteLabel: op.footnoteLabel, references: op.references ?? [], marks: op.marks ?? [], lineBreaksBefore:op.lineBreaksBefore??item.lineBreaksBefore??0, annotation: op.annotation }) } : item);
      if (op.type === 'remove') content = content.filter((_, i) => i !== index);
      if (op.type === 'split_text') {
        if (entry.type !== 'text' || (entry.format && entry.format !== 'plain') || entry.table || op.parts!.map(part => part.text).join('') !== entry.text) throw new Error('Split must preserve plain text exactly.');
        let offset = 0;
        const parts = op.parts!.map((part,index) => { const rich = sliceBlock({ nodeId: node.logicalId, textId: entry.logicalId!, text: entry.text!, marks: entry.marks ?? [], references: entry.references ?? [] }, offset, offset + part.text.length); offset += part.text.length; return { type: 'text' as const, ...part, ...rich, lineBreaksBefore:index?part.lineBreaksBefore??0:entry.lineBreaksBefore??0, draftId: op.id }; });
        content = [...content.slice(0, index), ...parts, ...content.slice(index + 1)];
      }
      if (op.type === 'merge_text') {
        const adjacent = content.slice(index, index + op.mergeIds!.length);
        if (adjacent.some((item, i) => item.type !== 'text' || (item.format && item.format !== 'plain') || item.table || item.logicalId !== op.mergeIds![i])) throw new Error('Merge cannot cross a child boundary or rich entry.');
        let offset = 0; const marks: NonNullable<DraftEntry['marks']> = [], references: NonNullable<DraftEntry['references']> = [];
        adjacent.forEach(item => { marks.push(...(item.marks ?? []).map(mark => ({ ...mark, start: mark.start + offset, end: mark.end + offset }))); references.push(...(item.references ?? []).map(reference => ({ ...reference, start: reference.start + offset, end: reference.end + offset }))); offset += (item.text ?? '').length; });
        content = [...content.slice(0, index), { type: 'text', ...op.parts![0], lineBreaksBefore:entry.lineBreaksBefore??0, marks: normalizeMarks(marks), references, draftId: op.id }, ...content.slice(index + adjacent.length)];
      }
      if (content !== result.content) result = { ...result, content, draftId: op.id };
    }
    return result;
  }
  const mapped = roots.map(walk);
  return remapDraftTargets(op.type === 'remove' ? mapped.filter(node => node.logicalId !== op.targetId) : mapped, op);
}
export function remapDraftTargets(roots: DraftNode[], op: DraftOperation): DraftNode[] {
  const replacements = new Map<string, string[]>();
  if (op.type === 'remove' && op.replacementId) replacements.set(op.targetId, [op.replacementId]);
  if (op.type === 'split_text') replacements.set(op.targetId, op.parts!.map(part => part.logicalId));
  if (op.type === 'merge_text') op.mergeIds!.forEach(id => replacements.set(id, [op.parts![0].logicalId]));
  if (!replacements.size) return roots;
  function walk(node: DraftNode): DraftNode {
    let changed = false, localChange = false;
    const content = node.content.map(entry => {
      if (entry.node) { const child = walk(entry.node); if (child !== entry.node) { changed = true; return { ...entry, node: child }; } return entry; }
      const anchors = entry.annotation?.anchorLogicalIds, mappedAnchors = anchors ? [...new Set(anchors.flatMap(id => replacements.get(id) ?? [id]))] : undefined;
      const mappedReferences = entry.references?.map(reference => { const target = reference.target.type === 'unit' && reference.target.logicalId ? replacements.get(reference.target.logicalId)?.[0] : undefined; return target && target !== reference.target.logicalId ? { ...reference, target:{...reference.target,logicalId:target} } : reference; });
      const annotationChanged = JSON.stringify(mappedAnchors) !== JSON.stringify(anchors), referencesChanged = JSON.stringify(mappedReferences) !== JSON.stringify(entry.references);
      if (!annotationChanged && !referencesChanged) return entry;
      changed = true; localChange = true; return { ...entry, draftId:op.id, ...(annotationChanged ? { annotation:{...entry.annotation!,anchorLogicalIds:mappedAnchors!} } : {}), ...(referencesChanged ? {references:mappedReferences} : {}) };

    });
    return changed ? { ...node, content, ...(localChange ? { draftId: op.id } : {}) } : node;
  }
  return roots.map(walk);
}

function markInserted(node: DraftNode, id: string): DraftNode {
  return { ...node, draftId: id, content: node.content.map(entry => entry.node ? { ...entry, node: markInserted(entry.node, id) } : { ...entry, draftId: id }) };
}
export function validateDraft(roots: DraftNode[], outline: ContentOutline, translate: (value: UiMessage) => string = value => value.en): string[] {
  const errors: string[] = []; const identities = new Set<string>();
  let endnotesStarted = false;
  const byCode = new Map(outline.kinds.map(kind => [kind.kindCode, kind]));
  const rootsAllowed = new Set(outline.kinds.filter(kind => kind.root).map(kind => kind.kindCode));
  if (rootsAllowed.size === 0 && outline.kinds[0]) rootsAllowed.add(outline.kinds[0].kindCode);
  function walk(node: DraftNode, parent?: ContentOutline['kinds'][number]) {
    if (endnotesStarted) errors.push(translate({ en: 'Footnotes must be at the end of the constitution. Move later body units before the notes.', de: 'Fußnoten müssen am Ende der Verfassung stehen. Verschieben Sie nachfolgenden Verfassungstext vor die Fußnoten.' }));
    const level = byCode.get(node.kind); const name = `${level?.displayLabel ?? node.kind} ${node.label ?? ''}`.trim();
    if (!level || (parent ? !parent.allowedChildKinds.includes(node.kind) : !rootsAllowed.has(node.kind))) { errors.push(`${name}: ${translate(ui.draftValidation.invalidParent)}`); return; }
    if (identities.has(node.logicalId)) errors.push(`${name}: ${translate(ui.draftValidation.duplicateIdentity)}`); identities.add(node.logicalId);
    for (const field of ['title', 'label'] as const) {
      const policy = field === 'title' ? level.titlePolicy : level.labelPolicy;
      if (policy === 'required' && !node[field]?.trim()) errors.push(`${name}: ${translate(field === 'title' ? ui.draftValidation.titleRequired : ui.draftValidation.labelRequired)}`);
      if (policy === 'none' && node[field]) errors.push(`${name}: ${translate(field === 'title' ? ui.draftValidation.titleNotAllowed : ui.draftValidation.labelNotAllowed)}`);
    }
    node.content.forEach(entry => {
      if (entry.format === 'footnote') endnotesStarted = true;
      else if (entry.type === 'text' && endnotesStarted) errors.push(translate({ en: 'Footnotes must be at the end of the constitution. Move later body text before the notes.', de: 'Fußnoten müssen am Ende der Verfassung stehen. Verschieben Sie nachfolgenden Verfassungstext vor die Fußnoten.' }));
      if (entry.node) { if (!level.mayHoldChildren || !level.allowedChildKinds.includes(entry.node.kind)) errors.push(`${name}: ${translate(ui.draftValidation.childNotAllowed)}`); walk(entry.node, level); }
      else if (!level.mayHoldText || entry.text == null || !entry.logicalId || identities.has(entry.logicalId)) errors.push(`${name}: ${translate(ui.draftValidation.invalidText)}`);
      else {
        identities.add(entry.logicalId);
        if(!Number.isInteger(entry.lineBreaksBefore??0)||(entry.lineBreaksBefore??0)<0||(entry.lineBreaksBefore??0)>16)errors.push(name+': '+translate(ui.draftValidation.invalidText));
        if ((entry.marks ?? []).some(mark => !['bold', 'italic', 'underline', 'strikethrough'].includes(mark.type) || !Number.isInteger(mark.start) || !Number.isInteger(mark.end) || mark.start < 0 || mark.end <= mark.start || mark.end > entry.text!.length)) errors.push(name+': '+translate(ui.draftValidation.invalidText));
      }
    });
  }
  roots.forEach(node => walk(node)); return errors;
}
export { delimitSentences as sentenceParts } from './continuous-editor';
export function scopedNodes(roots: DraftNode[], rootId: string, selection: string, scope: string): DraftNode[] {
  const root = findNode(roots, rootId); if (!root) return [];
  const selected = findNode(roots, selection) ?? nodes(roots).find(node => node.content.some(entry => entry.logicalId === selection)) ?? root;
  const candidates = nodes(roots).filter(node => node.kind === scope);
  const ancestor = candidates.find(node => nodes([node]).some(child => child.logicalId === selected.logicalId));
  if (ancestor) return [ancestor];
  return nodes([selected]).filter(node => node.kind === scope);
}
export type DraftDifference = { logicalId: string; field: string; before: string; after: string; sourceRevisionId?: string | null; targetRevisionId?: string | null };
export function draftDifferences(source: DraftNode[], target: DraftNode[]): DraftDifference[] {
  type Unit = { id: string; revision?: string | null; fields: Record<string, string> };
  function flatten(roots: DraftNode[]): Map<string, Unit> {
    const result = new Map<string, Unit>();
    function walk(node: DraftNode, parent: string, position: number) {
      result.set(node.logicalId, { id: node.logicalId, revision: token(node), fields: { title: node.title ?? '', label: node.label ?? '', parent, position: String(position) } });
      node.content.forEach((entry, index) => entry.node ? walk(entry.node, node.logicalId, index) : result.set(entry.logicalId!, { id: entry.logicalId!, revision: token(entry), fields: { text: entry.text ?? '', rich: JSON.stringify({ format: entry.format ?? 'plain', table: entry.table ?? null, footnoteLabel: entry.footnoteLabel ?? null, references: entry.references ?? [], marks: entry.marks ?? [], lineBreaksBefore:entry.lineBreaksBefore??0, annotation: entry.annotation ?? null }), parent: node.logicalId, position: String(index) } }));
    }
    roots.forEach((root, i) => walk(root, '', i)); return result;
  }
  const before = flatten(source), after = flatten(target); const changes: DraftDifference[] = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(id), b = after.get(id);
    if (!a || !b) changes.push({ logicalId: id, field: a ? 'removed' : 'inserted', before: a ? Object.values(a.fields).join(' · ') : '', after: b ? Object.values(b.fields).join(' · ') : '', sourceRevisionId: a?.revision, targetRevisionId: b?.revision });
    else for (const field of Object.keys(a.fields)) if (a.fields[field] !== b.fields[field]) changes.push({ logicalId: id, field, before: a.fields[field], after: b.fields[field], sourceRevisionId: a.revision, targetRevisionId: b.revision });
  }
  return changes;
}

/** Draft preview IDs are local anchors; historical public IDs remain version scoped. */
export function readerNode(node: DraftNode): import('./api').OrderedNode {
  return { ...node, label: node.label ?? null, title: node.title ?? null, revisionId: token(node), occurrenceId: `draft-${node.logicalId}`, content: node.content.map(entry => entry.node ? { type: 'child', node: readerNode(entry.node) } : { type: 'text', logicalId: entry.logicalId, revisionId: token(entry), text: entry.text, format: entry.format, table: entry.table, footnoteLabel: entry.footnoteLabel, references: entry.references, marks: entry.marks, lineBreaksBefore:entry.lineBreaksBefore??0, annotation: entry.annotation, occurrenceId: `draft-${entry.logicalId}` }) };
}
