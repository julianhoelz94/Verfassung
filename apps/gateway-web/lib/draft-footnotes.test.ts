import { expect, it } from 'vitest';
import { footnoteCardinality, indexDraftFootnoteReferences, indexDraftFootnotes } from './draft-footnotes';
import { footnoteEntries, footnoteItems } from './footnotes';

it('indexes nested constitution-end notes before projecting unloaded branches', () => {
  const roots = [{ logicalId: 'last', kind: 'article', content: [{ type: 'child' as const, node: { logicalId: 'parent', kind: 'paragraph', content: [{ type: 'text' as const, logicalId: 'note', format: 'footnote' as const, footnoteLabel: '†', text: 'Original note.' }] } }] }];
  expect(indexDraftFootnotes(roots)).toEqual([{ entry: roots[0].content[0].node.content[0], parentId: 'parent', rootId: 'last' }]);
  const entries = [{ type: 'text' as const, logicalId: 'note', occurrenceId: 'occurrence', format: 'footnote' as const, footnoteLabel: '†', text: 'Original note.' }];
  expect(footnoteEntries(entries)).toEqual(entries);
  expect(footnoteItems(entries, '/versions/pinned')).toEqual([{ logicalId: 'note', label: '†', text: 'Original note.', href: '/versions/pinned#fn-occurrence', marks: undefined }]);
});

it('allows repeated markers and rejects zero and missing-target markers across the complete draft',()=>{expect(footnoteCardinality([{logicalId:'a',label:'†'},{logicalId:'b',label:'2'},{logicalId:'c',label:'3'}],[{noteId:'a'},{noteId:'a'},{noteId:'b'},{noteId:'unknown'}])).toEqual([{kind:'missing',noteId:'c',label:'3',count:0},{kind:'unknown',noteId:'unknown',label:'',count:1}]);expect(footnoteCardinality([{logicalId:'a',label:'1'}],[{noteId:'a'}])).toEqual([]);const roots=[{logicalId:'article',kind:'article',content:[{type:'text' as const,logicalId:'body',text:'Text',references:[{logicalId:'marker',start:4,end:4,target:{type:'footnote' as const,footnoteId:'a'}}]}]}];expect(indexDraftFootnoteReferences(roots)).toEqual([{noteId:'a',rootId:'article',parentId:'article',entryId:'body',referenceId:'marker'}]);});
