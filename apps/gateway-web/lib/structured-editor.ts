import type { ContentOutline } from './api';

export type DraftEntry = { occurrenceId?: string | null; type: 'text' | 'child'; node?: DraftNode | null; logicalId?: string | null; revisionId?: string | null; draftId?: string | null; text?: string | null };
export type DraftNode = { occurrenceId?: string | null; logicalId: string; revisionId?: string | null; draftId?: string | null; kind: string; label?: string | null; title?: string | null; content: DraftEntry[] };
export type DraftOperation = { id: string; type: string; targetId: string; expectedRevisionId: string; text?: string; title?: string | null; label?: string | null; position?: number; destinationParentId?: string; destinationRevisionId?: string; parts?: { logicalId: string; text: string }[]; mergeIds?: string[]; node?: DraftNode };
export type StructuredPreview = { sessionId: string; sourceVersionId: string; sourceGeneration: number; settingsRevisionId: string; generation: number; roots: DraftNode[]; sourceRoots: DraftNode[]; operations: DraftOperation[] };
export function token(unit: DraftNode | DraftEntry): string { return unit.draftId ?? unit.revisionId ?? ''; }
export function nodes(roots: DraftNode[]): DraftNode[] { return roots.flatMap(node => [node, ...nodes(node.content.flatMap(entry => entry.node ? [entry.node] : []))]); }
export function findNode(roots: DraftNode[], id: string): DraftNode | undefined { return nodes(roots).find(node => node.logicalId === id); }

/** Local replay of the targeted command contract. Server replay remains authoritative. */
export function applyOperation(roots: DraftNode[], op: DraftOperation): DraftNode[] {
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
      if (op.type === 'replace_text') content = content.map((item, i) => i === index ? { ...item, text: op.text, draftId: op.id } : item);
      if (op.type === 'remove') content = content.filter((_, i) => i !== index);
      if (op.type === 'split_text') {
        if (entry.type !== 'text' || op.parts!.map(part => part.text).join('') !== entry.text) throw new Error('Split must preserve the exact text.');
        content = [...content.slice(0, index), ...op.parts!.map(part => ({ type: 'text' as const, ...part, draftId: op.id })), ...content.slice(index + 1)];
      }
      if (op.type === 'merge_text') {
        const adjacent = content.slice(index, index + op.mergeIds!.length);
        if (adjacent.some((item, i) => item.type !== 'text' || item.logicalId !== op.mergeIds![i])) throw new Error('Merge cannot cross a child boundary.');
        content = [...content.slice(0, index), { type: 'text', ...op.parts![0], draftId: op.id }, ...content.slice(index + adjacent.length)];
      }
      if (content !== result.content) result = { ...result, content, draftId: op.id };
    }
    return result;
  }
  const mapped = roots.map(walk);
  return op.type === 'remove' ? mapped.filter(node => node.logicalId !== op.targetId) : mapped;
}
function markInserted(node: DraftNode, id: string): DraftNode {
  return { ...node, draftId: id, content: node.content.map(entry => entry.node ? { ...entry, node: markInserted(entry.node, id) } : { ...entry, draftId: id }) };
}
export function validateDraft(roots: DraftNode[], outline: ContentOutline): string[] {
  const errors: string[] = []; const identities = new Set<string>();
  function walk(node: DraftNode, depth: number) {
    const level = outline.kinds[depth]; const name = `${level?.displayLabel ?? node.kind} ${node.label ?? ''}`.trim();
    if (!level || level.kindCode !== node.kind) { errors.push(`${name}: invalid level.`); return; }
    if (identities.has(node.logicalId)) errors.push(`${name}: duplicate identity.`); identities.add(node.logicalId);
    for (const field of ['title', 'label'] as const) {
      const policy = field === 'title' ? level.titlePolicy : level.labelPolicy;
      if (policy === 'required' && !node[field]?.trim()) errors.push(`${name}: ${field} is required.`);
      if (policy === 'none' && node[field]) errors.push(`${name}: ${field} is not allowed.`);
    }
    node.content.forEach(entry => {
      if (entry.node) { if (!level.mayHoldChildren || !level.allowedChildKinds.includes(entry.node.kind)) errors.push(`${name}: child kind is not allowed.`); walk(entry.node, depth + 1); }
      else if (!level.mayHoldText || entry.text == null || !entry.logicalId || identities.has(entry.logicalId)) errors.push(`${name}: invalid text entry.`);
      else identities.add(entry.logicalId);
    });
  }
  roots.forEach(node => walk(node, 0)); return errors;
}
export function sentenceParts(text: string): string[] {
  const parts: string[] = []; let start = 0;
  for (const match of text.matchAll(/[.!?]+(?:\s+|$)/gu)) {
    const end = match.index! + match[0].length;
    parts.push(text.slice(start, end)); start = end;
  }
  if (start < text.length) parts.push(text.slice(start));
  return parts.length ? parts : [text];
}
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
      node.content.forEach((entry, index) => entry.node ? walk(entry.node, node.logicalId, index) : result.set(entry.logicalId!, { id: entry.logicalId!, revision: token(entry), fields: { text: entry.text ?? '', parent: node.logicalId, position: String(index) } }));
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
  return { ...node, label: node.label ?? null, title: node.title ?? null, revisionId: token(node), occurrenceId: `draft-${node.logicalId}`, content: node.content.map(entry => entry.node ? { type: 'child', node: readerNode(entry.node) } : { type: 'text', logicalId: entry.logicalId, revisionId: token(entry), text: entry.text, occurrenceId: `draft-${entry.logicalId}` }) };
}
