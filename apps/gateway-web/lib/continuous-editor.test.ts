import { describe, expect, it } from 'vitest';
import { blockOf, canvasSignature, cleanSentenceBlock, cleanSentenceLayout, delimitSentences, normalizeMarks, segmentBlock, sentenceSeparator, SentenceLayoutError, simpleUnit, sliceBlock, WhitespaceOnlyReferenceError, type CanvasBlock } from './continuous-editor';
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
    const node:DraftNode={logicalId:'node',kind:'sentence',content:[{type:'text',logicalId:'text',text:'Text'}]}; expect(blockOf(simpleUnit(node)!)).toEqual({nodeId:'node',textId:'text',text:'Text',marks:[],references:[],lineBreaksBefore:0}); expect(simpleUnit({...node,content:[]})).toBeNull(); expect(simpleUnit({...node,content:[{...node.content[0],format:'footnote'}]})).toBeNull();
  });
  it('cleans sentence boundaries while preserving internal wording and rebasing UTF-16 formatting and references',()=>{
    const original:CanvasBlock={nodeId:'sentence',textId:'text',text:' \t😀 two  words.\n ',marks:[{type:'bold',start:0,end:18},{type:'italic',start:0,end:2}],references:[{logicalId:'link',start:1,end:16,target:{type:'unit',logicalId:'other'}},{logicalId:'start',start:0,end:0,target:{type:'footnote',footnoteId:'note'}},{logicalId:'end',start:18,end:18,target:{type:'footnote',footnoteId:'note'}}]};
    const cleaned=cleanSentenceBlock(original);expect(cleaned.text).toBe('😀 two  words.');expect(cleaned.marks).toEqual([{type:'bold',start:0,end:14}]);expect(cleaned.references).toEqual([{logicalId:'link',start:0,end:14,target:{type:'unit',logicalId:'other'}},{logicalId:'start',start:0,end:0,target:{type:'footnote',footnoteId:'note'}},{logicalId:'end',start:14,end:14,target:{type:'footnote',footnoteId:'note'}}]);expect(original.text).toBe(' \t😀 two  words.\n ');
  });
  it('retains note anchors on empty sentence wording and rejects links attached only to removed whitespace',()=>{const value:CanvasBlock={...block(),text:' \n ',marks:[{type:'bold',start:0,end:3}],references:[{logicalId:'note',start:1,end:2,target:{type:'footnote',footnoteId:'note'}}]};expect(cleanSentenceBlock(value)).toEqual({...value,text:'',marks:[],references:[{...value.references[0],start:0,end:0}]});expect(()=>cleanSentenceBlock({...value,references:[{logicalId:'link',start:0,end:1,target:{type:'external',url:'https://example.org'}}]})).toThrow(WhitespaceOnlyReferenceError);});
  it('moves only edited boundary newlines into layout and preserves internal line breaks',()=>{const first={...block(),text:'First.\r\n \n',marks:[],references:[],lineBreaksBefore:0},second={...block(),textId:'second',text:'\nSecond\ncontinued.',marks:[],references:[],lineBreaksBefore:2};const clean=cleanSentenceLayout([first,second],new Set(['text','second']));expect(clean.map(block=>[block.text,block.lineBreaksBefore])).toEqual([['First.',0],['Second\ncontinued.',5]]);expect(cleanSentenceLayout([first,second],new Set(['second'])).map(block=>[block.text,block.lineBreaksBefore])).toEqual([['First.\r\n \n',0],['Second\ncontinued.',3]]);expect(sentenceSeparator(clean[0],clean[1])).toBe('\n'.repeat(5));expect(sentenceSeparator({text:'First.'},{text:'Second',lineBreaksBefore:0})).toBe(' ');expect(sentenceSeparator({text:'First. '},{text:'Second'})).toBe('');});
  it('validates layout limits and compares canonical blocks independent of field order',()=>{expect(()=>cleanSentenceLayout([{...block(),text:'\nWord',lineBreaksBefore:16}],new Set(['text']))).toThrow(SentenceLayoutError);expect(()=>cleanSentenceLayout([{...block(),lineBreaksBefore:-1}],new Set())).toThrow(SentenceLayoutError);const original=block();expect(canvasSignature([original])).toBe(canvasSignature([{lineBreaksBefore:0,references:original.references,marks:original.marks,text:original.text,textId:original.textId,nodeId:original.nodeId}]));});
});
