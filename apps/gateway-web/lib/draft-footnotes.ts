import type { DraftEntry, DraftNode } from './structured-editor';
export type DraftFootnote = { entry: DraftEntry; parentId: string; rootId: string };
export type DraftFootnoteReference = { noteId: string; parentId: string; rootId: string; entryId: string };
export function indexDraftFootnotes(roots: DraftNode[]): DraftFootnote[] {
  function walk(node: DraftNode, rootId: string): DraftFootnote[] {
    return node.content.flatMap(entry => entry.node ? walk(entry.node, rootId) : entry.format === 'footnote' ? [{ entry, parentId: node.logicalId, rootId }] : []);
  }
  return roots.flatMap(root => walk(root, root.logicalId));
}
export function indexDraftFootnoteReferences(roots: DraftNode[]): DraftFootnoteReference[] {
  function walk(node: DraftNode, rootId: string): DraftFootnoteReference[] {
    return node.content.flatMap(entry => entry.node ? walk(entry.node, rootId) : (entry.references ?? []).flatMap(reference => reference.target.type === 'footnote' && reference.target.footnoteId && entry.logicalId ? [{
      noteId: reference.target.footnoteId, parentId: node.logicalId, rootId, entryId: entry.logicalId,
    }] : []));
  }
  return roots.flatMap(root => walk(root, root.logicalId));
}
