import { describe, expect, it } from 'vitest';
import { applyOperation, draftDifferences, remapDraftTargets, sentenceParts, scopedNodes, validateDraft, type DraftNode } from './structured-editor';
import type { ContentOutline } from './api';
const outline: ContentOutline = { kinds: [
  { kindCode: 'clause', displayLabel: 'Clause', sortOrder: 0, mayHoldText: true, mayHoldChildren: true, allowedChildKinds: ['sentence'], presentation: 'section', showLabel: true, showTitle: true, showKind: true, labelPolicy: 'required' },
  { kindCode: 'sentence', displayLabel: 'Sentence', sortOrder: 1, mayHoldText: true, mayHoldChildren: false, allowedChildKinds: [], presentation: 'concatenated', showLabel: false, showTitle: false, showKind: false },
] };
const root: DraftNode = { logicalId: 'root', revisionId: 'r0', kind: 'clause', label: '46a', content: [
  { type: 'text', logicalId: 'before', revisionId: 'r1', text: 'Before. ' },
  { type: 'child', node: { logicalId: 'sentence', revisionId: 'r2', kind: 'sentence', label: '(2a)', content: [{ type: 'text', logicalId: 'wording', revisionId: 'r3', text: 'Original.' }] } },
  { type: 'text', logicalId: 'after', revisionId: 'r4', text: ' After.' },
] };
describe('ordered editorial commands', () => {
  it('edits one entry and preserves parent text and child identity', () => {
    const next = applyOperation([root], { id: 'op', type: 'replace_text', targetId: 'wording', expectedRevisionId: 'r3', text: 'Changed.' });
    expect(next[0].content[0]).toBe(root.content[0]);
    expect(next[0].content[2]).toBe(root.content[2]);
    expect(next[0].content[1].node?.label).toBe('(2a)');
    expect(draftDifferences([root], next)).toEqual([expect.objectContaining({ logicalId: 'wording', field: 'text', before: 'Original.', after: 'Changed.' })]);
  });
  it('cannot merge across a child boundary', () => {
    expect(() => applyOperation([root], { id: 'op', type: 'merge_text', targetId: 'before', expectedRevisionId: 'r1', mergeIds: ['before', 'after'], parts: [{ logicalId: 'merged', text: 'Before.  After.' }] })).toThrow('child boundary');
  });
  it('proposes lossless boundaries for pasted text', () => {
    for (const text of ['One. Two!\nThree?', ' Dr. Example. Next.', 'plain', '', 'Art.12 applies.', '3.14 applies.', 'a.b']) expect(sentenceParts(text).join('')).toBe(text);
  });
  it('checks required literal labels and parent text capabilities', () => {
    expect(validateDraft([root], outline)).toEqual([]);
    expect(validateDraft([{ ...root, label: '' }], outline)).toContain('Clause: label is required.');
    expect(validateDraft([root], { kinds: [{ ...outline.kinds[0], mayHoldText: false }, outline.kinds[1]] })).toContain('Clause 46a: invalid text entry.');
  });
  it('scopes a descendant and returns its ancestor without changing selection', () => {
    expect(scopedNodes([root], 'root', 'root', 'sentence').map(node => node.logicalId)).toEqual(['sentence']);
    expect(scopedNodes([root], 'root', 'wording', 'clause').map(node => node.logicalId)).toEqual(['root']);
  });
  it('records moves and root insertion without copying untouched revisions', () => {
    const moved = applyOperation([root], { id: 'op', type: 'move', targetId: 'sentence', expectedRevisionId: 'r2', destinationParentId: 'root', destinationRevisionId: 'r0', position: 0 });
    expect(moved[0].content[0].node?.revisionId).toBe('r2');
    expect(draftDifferences([root], moved)).toContainEqual(expect.objectContaining({ logicalId: 'sentence', field: 'position', before: '1', after: '0' }));
    const added = applyOperation([root], { id: 'op', type: 'insert_root', targetId: 'root', expectedRevisionId: 'r0', position: 1, node: { ...root, logicalId: 'new', revisionId: null, content: [] } });
    expect(added.map(node => node.logicalId)).toEqual(['root', 'new']);
    expect(added[0]).toBe(root);
  });
  it('records split lineage as removal and insertion with exact bytes', () => {
    const next = applyOperation([root], { id: 'op', type: 'split_text', targetId: 'before', expectedRevisionId: 'r1', parts: [{ logicalId: 'a', text: 'Before.' }, { logicalId: 'b', text: ' ' }] });
    expect(next[0].content.slice(0, 2).map(entry => entry.text).join('')).toBe('Before. ');
    expect(draftDifferences([root], next).filter(change => change.field === 'inserted')).toHaveLength(2);
  });
});


describe('rich draft identity preservation',()=>{
  const annotationRoot:DraftNode={logicalId:'note-root',revisionId:'note-root-revision',kind:'clause',label:'2',content:[{type:'child',node:{logicalId:'note-owner',revisionId:'note-owner-revision',kind:'sentence',content:[{type:'text',logicalId:'linked',revisionId:'linked-revision',text:'See source',references:[{logicalId:'unit-link',start:0,end:3,target:{type:'unit',logicalId:'second'}}]},{type:'text',logicalId:'note',revisionId:'note-revision',text:'Annotation',format:'footnote',footnoteLabel:'a',annotation:{kind:'editorial',anchorLogicalIds:['first','second']}}]}}]};
  it('remaps cross-root text references and annotation anchors while preserving ancestor tokens',()=>{
    const source:DraftNode={logicalId:'source',revisionId:'source-revision',kind:'clause',label:'1',content:[{type:'text',logicalId:'first',revisionId:'first-revision',text:'First. ',marks:[{type:'bold',start:0,end:6}]},{type:'text',logicalId:'second',revisionId:'second-revision',text:'Second.',marks:[{type:'italic',start:0,end:7}]}]};
    const next=applyOperation([source,annotationRoot],{id:'merge',type:'merge_text',targetId:'first',expectedRevisionId:'first-revision',mergeIds:['first','second'],parts:[{logicalId:'first',text:'First. Second.'}]});
    expect(next[0].content[0].marks).toEqual([{type:'bold',start:0,end:6},{type:'italic',start:7,end:14}]);const owner=next[1].content[0].node!;expect(owner.content[0].references?.[0].target.logicalId).toBe('first');expect(owner.content[1].annotation?.anchorLogicalIds).toEqual(['first']);expect(owner.draftId).toBe('merge');expect(next[1].draftId).toBeUndefined();
  });
  it('expands split annotation anchors but retains unit references at the first part and boundary markers before the split',()=>{
    const source:DraftNode={logicalId:'source',revisionId:'source-revision',kind:'clause',label:'1',content:[{type:'text',logicalId:'second',revisionId:'second-revision',text:'One. Two',marks:[{type:'underline',start:0,end:8}],references:[{logicalId:'footnote-reference',start:5,end:5,target:{type:'footnote',footnoteId:'note'}}]}]};
    const next=applyOperation([source,annotationRoot],{id:'split',type:'split_text',targetId:'second',expectedRevisionId:'second-revision',parts:[{logicalId:'second',text:'One. '},{logicalId:'third',text:'Two'}]});expect(next[0].content[0].references?.[0].start).toBe(5);expect(next[0].content[1].references).toEqual([]);expect(next[0].content[1].marks).toEqual([{type:'underline',start:0,end:3}]);expect(next[1].content[0].node?.content[0].references?.[0].target.logicalId).toBe('second');expect(next[1].content[0].node?.content[1].annotation?.anchorLogicalIds).toEqual(['first','second','third']);
  });
  it('remaps removed node targets only with an explicit replacement',()=>{const next=remapDraftTargets([annotationRoot],{id:'remove',type:'remove',targetId:'second',expectedRevisionId:'second-revision',replacementId:'first'});expect(next[0].content[0].node?.content[0].references?.[0].target.logicalId).toBe('first');expect(next[0].content[0].node?.content[1].annotation?.anchorLogicalIds).toEqual(['first']);expect(remapDraftTargets([annotationRoot],{id:'remove',type:'remove',targetId:'second',expectedRevisionId:'second-revision'})).toEqual([annotationRoot]);});
  it('mirrors the server rich replacement defaults and validates endnote order and mark ranges',()=>{const marked={...root,content:[{...root.content[0],marks:[{type:'bold' as const,start:0,end:6}]}]};expect(applyOperation([marked],{id:'plain',type:'replace_text',targetId:'before',expectedRevisionId:'r1',text:'Before. ',format:'plain'})[0].content[0].marks).toEqual([]);expect(applyOperation([marked],{id:'legacy',type:'replace_text',targetId:'before',expectedRevisionId:'r1',text:'Before. '})[0].content[0].marks).toEqual(marked.content[0].marks);const invalid={...marked,content:[{...marked.content[0],marks:[{type:'bold' as const,start:0,end:99}]}]};expect(validateDraft([invalid],outline)).toContain('Clause 46a: invalid text entry.');expect(validateDraft([annotationRoot,root],outline).some(error=>error.includes('end of the constitution'))).toBe(true);});
});
