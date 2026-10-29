import type { OrderedInlineReference, OrderedTextMark } from './api';
import type { DraftEntry, DraftNode } from './structured-editor';

export type CanvasUnit = { node: DraftNode; entry: DraftEntry };
export type CanvasBlock = { nodeId: string; textId: string; text: string; marks: OrderedTextMark[]; references: OrderedInlineReference[]; lineBreaksBefore?:number };
export function canvasSignature(blocks:readonly CanvasBlock[]):string{return JSON.stringify(blocks.map(block=>({nodeId:block.nodeId,textId:block.textId,text:block.text,marks:block.marks,references:block.references,lineBreaksBefore:block.lineBreaksBefore??0})));}

const abbreviations = new Set(['dr', 'prof', 'mr', 'mrs', 'ms', 'sr', 'jr', 'st', 'art', 'abs', 'nr', 'z', 'b', 'bzw', 'usw', 'vgl', 'ca', 'etc', 'e', 'g', 'i']);

/** Exact slices: whitespace belongs to the preceding sentence and is never synthesized. */
export function delimitSentences(text: string, delimiters: readonly string[] = ['.', '!', '?']): string[] {
  const tokens = [...new Set(delimiters)].filter(Boolean).sort((a, b) => b.length - a.length);
  const result: string[] = []; let start = 0;
  for (let index = 0; index < text.length;) {
    const delimiter = tokens.find(token => text.startsWith(token, index));
    if (!delimiter) { index++; continue; }
    let end = index + delimiter.length;
    if (delimiter === '.') {
      const before = text.slice(start, index);
      const word = before.match(/[\p{L}]+$/u)?.[0] ?? '';
      const token = before.match(/\S+$/u)?.[0] ?? '';
      if ((/\d/u.test(text[index - 1] ?? '') && /\d/u.test(text[end] ?? '')) || abbreviations.has(word.toLowerCase()) || /^[A-ZÄÖÜ]$/u.test(word) || /(?:https?:\/\/|www\.|@)/iu.test(token)) { index = end; continue; }
    }
    while (tokens.some(token => text.startsWith(token, end))) end += tokens.find(token => text.startsWith(token, end))!.length;
    while (/["'”’“‘»›)\]}]/u.test(text[end] ?? '') && end < text.length) end++;
    if (delimiter === '.' && end < text.length && !/\s/u.test(text[end])) { index = end; continue; }
    while (end < text.length && /\s/u.test(text[end])) end++;
    if (end > start) result.push(text.slice(start, end));
    start = end; index = end;
  }
  if (start < text.length) result.push(text.slice(start));
  return result.length ? result : [text];
}

export function simpleUnit(node: DraftNode): CanvasUnit | null {
  const body = node.content.filter(entry => entry.format !== 'footnote'), entry = body[0];
  return body.length === 1 && entry?.type === 'text' && (!entry.format || entry.format === 'plain') && !entry.table && entry.logicalId ? { node, entry } : null;
}

export function blockOf(unit: CanvasUnit): CanvasBlock {
  return { nodeId: unit.node.logicalId, textId: unit.entry.logicalId!, text: unit.entry.text ?? '', marks: unit.entry.marks ?? [], references: unit.entry.references ?? [],lineBreaksBefore:unit.entry.lineBreaksBefore??0 };
}

export function sliceBlock(block: CanvasBlock, start: number, end: number): Pick<CanvasBlock, 'text' | 'marks' | 'references'> {
  return {
    text: block.text.slice(start, end),
    marks: block.marks.flatMap(mark => mark.start < end && mark.end > start ? [{ ...mark, start: Math.max(start, mark.start) - start, end: Math.min(end, mark.end) - start }] : []),
    references: block.references.filter(reference => reference.start === reference.end ? (reference.start > start && reference.end <= end || start === 0 && reference.start === 0) : reference.start >= start && reference.end <= end).map(reference => ({ ...reference, start: reference.start - start, end: reference.end - start })),
  };
}

export class WhitespaceOnlyReferenceError extends Error {}
export class SentenceLayoutError extends Error {}

/** Persist sentence wording without view separators; positions use UTF-16. */
export function cleanSentenceBlock(block:CanvasBlock):CanvasBlock {
  const start=block.text.length-block.text.trimStart().length,end=Math.max(start,block.text.trimEnd().length),length=end-start;
  const point=(offset:number)=>Math.max(0,Math.min(length,offset-start));
  const references=block.references.map(reference=>{
    const next={...reference,start:point(reference.start),end:point(reference.end)};
    if(next.start===next.end&&reference.target.type!=='footnote')throw new WhitespaceOnlyReferenceError('A link must retain sentence text.');
    return next;
  });
  return {...block,text:block.text.slice(start,end),marks:normalizeMarks(block.marks.flatMap(mark=>{const from=point(mark.start),to=point(mark.end);return from<to?[{...mark,start:from,end:to}]:[];})),references};
}

/** Move edited boundary newlines into layout without changing inline offsets. */
export function cleanSentenceLayout(blocks:CanvasBlock[],touched:ReadonlySet<string>):CanvasBlock[] {
  const result=blocks.map(block=>touched.has(block.textId)?cleanSentenceBlock(block):{...block});
  const breaks=(text:string)=>(text.match(/\r\n|\r|\n/g)??[]).length;
  for(let index=0;index<blocks.length;index++){
    const block=blocks[index];if(!touched.has(block.textId))continue;
    const leading=block.text.match(/^\s*/u)![0],trailing=block.text.trim()?block.text.match(/\s*$/u)![0]:'';
    result[index].lineBreaksBefore=(result[index].lineBreaksBefore??0)+breaks(leading);
    if(index+1<result.length)result[index+1].lineBreaksBefore=(result[index+1].lineBreaksBefore??0)+breaks(trailing);
  }
  if(result.some(block=>!Number.isInteger(block.lineBreaksBefore??0)||(block.lineBreaksBefore??0)<0||(block.lineBreaksBefore??0)>16))throw new SentenceLayoutError('At most 16 line breaks are allowed between sentences.');
  return result;
}

export function sentenceSeparator(previous:Pick<CanvasBlock,'text'>,next:Pick<CanvasBlock,'text'|'lineBreaksBefore'>):string {
  return next.lineBreaksBefore?'\n'.repeat(Math.max(0,Math.min(16,next.lineBreaksBefore))):!/\s$/u.test(previous.text)&&!/^\s/u.test(next.text)?' ':'';
}

/** Keep reference spans indivisible; a zero-width note follows its exact cursor position. */
export function segmentBlock(block: CanvasBlock, delimiters: readonly string[]): CanvasBlock[] {
  const parts = delimitSentences(block.text, delimiters);
  const offsets = [0]; parts.forEach(part => offsets.push(offsets.at(-1)! + part.length));
  const cuts = offsets.slice(1, -1).filter(cut => !block.references.some(reference => reference.start < cut && reference.end > cut));
  const boundaries = [0, ...cuts, block.text.length];
  return boundaries.slice(1).map((end, index) => ({ nodeId: index ? crypto.randomUUID() : block.nodeId, textId: index ? crypto.randomUUID() : block.textId,lineBreaksBefore:index?0:block.lineBreaksBefore??0, ...sliceBlock(block, boundaries[index], end) }));
}

export function normalizeMarks(marks: OrderedTextMark[]): OrderedTextMark[] {
  const sorted = marks.filter(mark => mark.start < mark.end).sort((a, b) => a.type.localeCompare(b.type) || a.start - b.start || a.end - b.end);
  const result: OrderedTextMark[] = [];
  for (const mark of sorted) {
    const previous = result.at(-1);
    if (previous?.type === mark.type && previous.end >= mark.start) previous.end = Math.max(previous.end, mark.end);
    else result.push({ ...mark });
  }
  return result;
}
