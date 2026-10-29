import type { DraftEntry, DraftNode } from './structured-editor';
export type DraftFootnote = { entry: DraftEntry; parentId: string; rootId: string };
export type DraftFootnoteReference = { noteId: string; parentId: string; rootId: string; entryId: string; referenceId?:string };
export function indexDraftFootnotes(roots: DraftNode[]): DraftFootnote[] {
  function walk(node: DraftNode, rootId: string): DraftFootnote[] {
    return node.content.flatMap(entry => entry.node ? walk(entry.node, rootId) : entry.format === 'footnote' ? [{ entry, parentId: node.logicalId, rootId }] : []);
  }
  return roots.flatMap(root => walk(root, root.logicalId));
}
export function indexDraftFootnoteReferences(roots: DraftNode[]): DraftFootnoteReference[] {
  function walk(node: DraftNode, rootId: string): DraftFootnoteReference[] {
    return node.content.flatMap(entry => entry.node ? walk(entry.node, rootId) : (entry.references ?? []).flatMap(reference => reference.target.type === 'footnote' && reference.target.footnoteId && entry.logicalId ? [{
      noteId: reference.target.footnoteId, parentId: node.logicalId, rootId, entryId: entry.logicalId,referenceId:reference.logicalId,
    }] : []));
  }
  return roots.flatMap(root => walk(root, root.logicalId));
}

export function footnoteCardinality(notes:{logicalId:string;label:string}[],references:{noteId:string}[]):{kind:'missing'|'multiple'|'unknown';noteId:string;label:string;count:number}[]{
  const counts=new Map<string,number>();for(const reference of references)counts.set(reference.noteId,(counts.get(reference.noteId)??0)+1);
  const known=new Set(notes.map(note=>note.logicalId));
  return [...notes.flatMap(note=>{const count=counts.get(note.logicalId)??0;return count===1?[]:[{kind:count?'multiple' as const:'missing' as const,noteId:note.logicalId,label:note.label,count}];}),...[...counts].flatMap(([noteId,count])=>known.has(noteId)?[]:[{kind:'unknown' as const,noteId,label:'',count}])];
}
