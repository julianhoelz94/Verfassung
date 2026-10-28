import { describe, expect, it } from 'vitest';
import { blockOf, delimitSentences, normalizeMarks, segmentBlock, simpleUnit, sliceBlock, type CanvasBlock } from './continuous-editor';
import type { DraftNode } from './structured-editor';

const block = (): CanvasBlock => ({ nodeId:'sentence',textId:'text',text:'First. Second!', marks:[{type:'bold',start:0,end:14}], references:[{logicalId:'note-anchor',start:7,end:7,target:{type:'footnote',footnoteId:'note'}}] });
describe('continuous sentence boundaries', () => {
  it('retains exact whitespace while recognizing configured punctuation and unfinished text', () => {
    const value = 'First.  Second!\nThird? Unfinished'; expect(delimitSentences(value)).toEqual(['First.  ','Second!\n','Third? ','Unfinished']); expect(delimitSentences(value).join('')).toBe(value);
    expect(delimitSentences('Eins; Zwei. Noch zwei; Drei',[';'])).toEqual(['Eins; ','Zwei. Noch zwei; ','Drei']);
    expect(delimitSentences('甲。乙！！丙',['。','！！'])).toEqual(['甲。','乙！！','丙']);
    expect(delimitSentences('One?!” Next… done',['?!','…'])).toEqual(['One?!” ','Next… ','done']);
  });
  it('does not damage abbreviations, initials, decimals, URLs, email or closing quotes', () => {
    const text = 'Dr. Meier misst 3.14 Meter. Fertig!'; expect(delimitSentences(text)).toEqual(['Dr. Meier misst 3.14 Meter. ','Fertig!']);
    expect(delimitSentences('A. Meier liest Art.12. Weiter.')).toEqual(['A. Meier liest Art.12. ','Weiter.']);
    expect(delimitSentences('See https://example.org/a.b and user@example.org. Done.')).toEqual(['See https://example.org/a.b and user@example.org. Done.']);
    expect(delimitSentences('Er sagt „Hallo.“ Danach!')).toEqual(['Er sagt „Hallo.“ ','Danach!']);
    expect(delimitSentences('No configured boundary!',[])).toEqual(['No configured boundary!']); expect(delimitSentences('')).toEqual(['']);
  });
  it('keeps the first stable identity and slices formatting and cursor note anchors', () => {
    const original=block(), parts=segmentBlock(original,['.','!','?']); expect(parts).toHaveLength(2); expect(parts[0].nodeId).toBe('sentence'); expect(parts[1].nodeId).not.toBe('sentence'); expect(parts.map(part=>part.text).join('')).toBe(original.text); expect(parts[0].marks).toEqual([{type:'bold',start:0,end:7}]); expect(parts[1].marks).toEqual([{type:'bold',start:0,end:7}]); expect(parts[0].references[0]).toEqual(expect.objectContaining({logicalId:'note-anchor',start:7,end:7})); expect(parts[1].references).toEqual([]);
  });
  it('keeps nonempty references indivisible and retains an end anchor', () => {
    const value=block(); value.references=[{logicalId:'url',start:0,end:10,target:{type:'external',url:'https://example.org'}}]; expect(segmentBlock(value,['.'])).toHaveLength(1);
    value.references=[{logicalId:'end',start:14,end:14,target:{type:'footnote',footnoteId:'note'}}]; expect(sliceBlock(value,7,14).references[0]).toEqual(expect.objectContaining({start:7,end:7}));
  });
  it('normalizes same-style overlap without losing combinations and detects simple leaf content', () => {
    expect(normalizeMarks([{type:'bold',start:2,end:5},{type:'bold',start:0,end:3},{type:'italic',start:1,end:4},{type:'underline',start:2,end:2}])).toEqual([{type:'bold',start:0,end:5},{type:'italic',start:1,end:4}]);
    const node:DraftNode={logicalId:'node',kind:'sentence',content:[{type:'text',logicalId:'text',text:'Text'}]}; expect(blockOf(simpleUnit(node)!)).toEqual({nodeId:'node',textId:'text',text:'Text',marks:[],references:[]}); expect(simpleUnit({...node,content:[]})).toBeNull(); expect(simpleUnit({...node,content:[{...node.content[0],format:'footnote'}]})).toBeNull();
  });
});
