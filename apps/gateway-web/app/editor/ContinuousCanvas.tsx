'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { Schema, type Node as ProseNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import type { OrderedInlineReference, OrderedTextMark } from '../../lib/api';
import { blockOf, canvasSignature, normalizeMarks, segmentBlock, sentenceSeparator, sliceBlock, type CanvasBlock, type CanvasUnit } from '../../lib/continuous-editor';
import { updateFootnoteHitTargets } from '../../lib/footnote-hit-targets';
import { useFootnoteActions } from '../components/Footnotes';
import styles from './compact-editor.module.css';

const schema = new Schema({
  nodes: {
    doc: { content: 'sentence+' },
    sentence: { content: 'text*', group: 'block', whitespace: 'pre', attrs: { nodeId: { default: '' }, textId: { default: '' }, protected: { default: false }, anchors: { default: [] }, gapBefore: { default: false },lineBreaksBefore:{default:0} }, toDOM: node => ['span', { class: 'ce-sentence', 'data-unit': node.attrs.nodeId, 'data-editor-entry': node.attrs.textId, 'data-gap': String(node.attrs.gapBefore),'data-breaks':String(node.attrs.lineBreaksBefore>0),'data-separator':'\n'.repeat(Math.max(0,Math.min(16,node.attrs.lineBreaksBefore))),'data-extra-separator':'\n'.repeat(Math.max(0,Math.min(16,node.attrs.lineBreaksBefore)-1)) }, 0], parseDOM: [{ tag: 'span.ce-sentence', preserveWhitespace: 'full' }, { tag: 'p', preserveWhitespace: 'full' }] },
    text: { group: 'inline' },
  },
  marks: {
    bold: { toDOM: () => ['strong', 0], parseDOM: [{ tag: 'strong' }, { tag: 'b' }] },
    italic: { toDOM: () => ['em', 0], parseDOM: [{ tag: 'em' }, { tag: 'i' }] },
    underline: { toDOM: () => ['u', 0], parseDOM: [{ tag: 'u' }] },
    strikethrough: { toDOM: () => ['s', 0], parseDOM: [{ tag: 's' }, { tag: 'strike' }] },
    reference: { attrs: { id: {}, target: {} }, inclusive: false, toDOM: mark => ['span', { 'data-reference': mark.attrs.id, class: 'ce-reference' }, 0] },
  },
});

function documentOf(blocks: CanvasBlock[], units: CanvasUnit[]): ProseNode {
  return schema.nodes.doc.create(null, blocks.map((block, index) => {
    const ends = [...new Set([0, block.text.length, ...block.marks.flatMap(mark => [mark.start, mark.end]), ...block.references.flatMap(reference => [reference.start, reference.end])])].sort((a, b) => a - b);
    const inline: ProseNode[] = [];
    ends.slice(1).forEach((end, index) => {
      const start = ends[index]; if (start === end) return;
      const marks = block.marks.filter(mark => mark.start <= start && mark.end >= end).map(mark => schema.marks[mark.type].create());
      const reference = block.references.find(reference => reference.start < reference.end && reference.start <= start && reference.end >= end);
      if (reference) marks.push(schema.marks.reference.create({ id: reference.logicalId, target: reference.target }));
      inline.push(schema.text(block.text.slice(start, end), marks));
    });
    const source = units.find(unit => unit.node.logicalId === block.nodeId);
    return schema.nodes.sentence.create({ nodeId: block.nodeId, textId: block.textId, protected: Boolean(source?.node.label || source?.node.title), anchors: block.references.filter(reference => reference.start === reference.end),lineBreaksBefore:block.lineBreaksBefore??0, gapBefore: !block.lineBreaksBefore&&index > 0 && !/\s$/u.test(blocks[index-1].text) && !/^\s/u.test(block.text) }, inline);
  }));
}

function blocksOf(doc: ProseNode): CanvasBlock[] {
  const result: CanvasBlock[] = [];
  doc.forEach(node => {
    const marks: OrderedTextMark[] = [], references: OrderedInlineReference[] = [...node.attrs.anchors];
    node.forEach((inline, offset) => inline.marks.forEach(mark => {
      if (mark.type.name === 'reference') {
        const previous = references.find(reference => reference.logicalId === mark.attrs.id);
        if (previous) previous.end = Math.max(previous.end, offset + inline.nodeSize);
        else references.push({ logicalId: mark.attrs.id, start: offset, end: offset + inline.nodeSize, target: mark.attrs.target });
      } else marks.push({ type: mark.type.name as OrderedTextMark['type'], start: offset, end: offset + inline.nodeSize });
    }));
    result.push({ nodeId: node.attrs.nodeId || crypto.randomUUID(), textId: node.attrs.textId || crypto.randomUUID(), text: node.textContent,lineBreaksBefore:node.attrs.lineBreaksBefore??0, marks: normalizeMarks(marks), references: references.sort((a, b) => a.start - b.start || a.end - b.end) });
  });
  return result;
}

function flatPosition(doc: ProseNode, position: number): number {
  let total = 0, found = false;
  doc.forEach((node, offset) => { if (found) return; if (position <= offset + node.nodeSize) { total += Math.max(0, Math.min(node.content.size, position - offset - 1)); found = true; } else total += node.content.size; });
  return total;
}
function documentPosition(doc: ProseNode, point: number): number {
  let remaining = point, result = 1, found = false;
  doc.forEach((node, offset) => { if (found) return; result = offset + 1 + Math.min(remaining, node.content.size); if (remaining <= node.content.size) found = true; else remaining -= node.content.size; });
  return result;
}

/** Native select-all replacement can remove the rendered sentence wrappers. The
 * DOM parser then supplies default attributes; recover legal identity from the
 * previous blocks before publishing a transaction to the structured draft. */
function restoreParsedIdentities(transaction:Transaction, previous:ProseNode):Transaction {
  const originals:{node:ProseNode;position:number}[]=[];
  previous.forEach((node,offset)=>originals.push({node,position:transaction.mapping.map(offset,1)}));
  const claimedNodes=new Set<string>(),claimedTexts=new Set<string>();
  transaction.doc.forEach(node=>{if(node.attrs.nodeId)claimedNodes.add(node.attrs.nodeId);if(node.attrs.textId)claimedTexts.add(node.attrs.textId);});
  const seenNodes=new Set<string>(),seenTexts=new Set<string>();
  transaction.doc.forEach((node,offset)=>{
    const identified=node.attrs.nodeId&&node.attrs.textId&&!seenNodes.has(node.attrs.nodeId)&&!seenTexts.has(node.attrs.textId);
    if(identified){seenNodes.add(node.attrs.nodeId);seenTexts.add(node.attrs.textId);return;}
    const available=originals.filter(({node})=>!claimedNodes.has(node.attrs.nodeId)&&!claimedTexts.has(node.attrs.textId));
    const original=available.find(({position})=>position>=offset&&position<=offset+node.nodeSize)??available[0];
    const nodeId=original?.node.attrs.nodeId??crypto.randomUUID(),textId=original?.node.attrs.textId??crypto.randomUUID();
    claimedNodes.add(nodeId);claimedTexts.add(textId);seenNodes.add(nodeId);seenTexts.add(textId);
    transaction=transaction.setNodeMarkup(offset,undefined,{...node.attrs,...original?.node.attrs,nodeId,textId});
  });
  return transaction;
}

export type CanvasController = { endAnchor:()=>{textId:string;nodeId:string;start:number;end:number}; isAlive: () => boolean; format: (type: OrderedTextMark['type']) => void; focus: (position?: { textId: string; start: number; end?: number }) => void; segment: () => void; split: () => void; merge: () => void; addReference: (target: OrderedInlineReference['target']) => boolean; selection: () => { textId: string; nodeId: string; start: number; end: number }; activeMarks: () => string[] };
export type CanvasMarkerContext={noteId:string;referenceId:string;textId:string;nodeId:string;anchor:{x:number;y:number;trigger?:HTMLElement}};
export type CanvasTextContext={selected:boolean;canSplit:boolean;canMerge:boolean;anchor:CanvasMarkerContext['anchor']};
type Props = { active?:boolean; units: CanvasUnit[]; label: string; editable: boolean; flowing: boolean; boundaries: boolean; automatic: boolean; delimiters: string[]; notes: { logicalId: string; label: string }[]; unitLabels?: Record<string, string>; resetVersion?: number; onSelectUnit?: (id: string) => void; onTextContextMenu?:(context:CanvasTextContext)=>void; onMarkerContextMenu?:(context:CanvasMarkerContext)=>void;onMarkerActivate?:(context:CanvasMarkerContext)=>void; onChange: (blocks: CanvasBlock[], grouping: string) => CanvasBlock[] | false | void; onActivate: (controller: CanvasController, textId: string) => void; onUndo: () => void; onRedo: () => void };

export function ContinuousCanvas(props: Props) {
  const host = useRef<HTMLDivElement>(null), viewRef = useRef<EditorView | null>(null), latest = useRef(props), composing = useRef(false), lastSent = useRef('');
  const lastReceived=useRef(''), pending=useRef<string[]>([]), presentation=useRef(''), receivedReset=useRef(props.resetVersion), acceptedBlocks=useRef(new Map<string,CanvasBlock>());
  useLayoutEffect(() => { latest.current = props; }, [props]);
  const { showNote, previewNote, hidePreview } = useFootnoteActions();
  const noteActions = useRef({ showNote, previewNote, hidePreview }); useLayoutEffect(() => { noteActions.current = { showNote, previewNote, hidePreview }; }, [showNote, previewNote, hidePreview]);
  useEffect(() => {
    const view = new EditorView(host.current!, {
      state: EditorState.create({ doc: documentOf(latest.current.units.map(blockOf), latest.current.units), plugins: [keymap({
        'Mod-b': (state, dispatch) => toggleMark(schema.marks.bold,null,{removeWhenPresent:false})(state, dispatch),
        'Mod-i': (state, dispatch) => toggleMark(schema.marks.italic,null,{removeWhenPresent:false})(state, dispatch),
        'Mod-u': (state, dispatch) => toggleMark(schema.marks.underline,null,{removeWhenPresent:false})(state, dispatch),
        'Mod-z': () => { latest.current.onUndo(); return true; },
        'Shift-Mod-z': () => { latest.current.onRedo(); return true; },
        'Mod-y': () => { latest.current.onRedo(); return true; },
        Enter: (state, dispatch) => { dispatch?.(state.tr.insertText('\n')); return true; },
      }), keymap(baseKeymap)] }),
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': latest.current.label, class: styles.prose },
      editable: () => latest.current.editable,
      clipboardTextSerializer(slice){let text='',previous:CanvasBlock|undefined;slice.content.forEach(node=>{const block=blocksOf(schema.nodes.doc.create(null,[node]))[0];if(previous)text+=sentenceSeparator(previous,block);text+=block.text;previous=block;});return text;},
      handlePaste(current, event) { if(!latest.current.editable)return true;const text = event.clipboardData?.getData('text/plain'); if (text === undefined) return false; current.dispatch(current.state.tr.insertText(text).setMeta('paste', true)); return true; },
      handleKeyDown(current, event) {
        if(latest.current.editable&&latest.current.onTextContextMenu&&(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey)){event.preventDefault();const rect=current.dom.getBoundingClientRect();openTextMenu(current,{x:rect.left,y:rect.top+20,trigger:current.dom});return true;}
        const selection = current.state.selection;
        if (!selection.empty) return false;
        const depth = selection.$from.depth;
        if (!depth) return false;
        if (event.key === 'Backspace' && selection.$from.parentOffset === 0 && selection.$from.parent.attrs.protected) return true;
        if (event.key === 'Backspace' && selection.$from.parentOffset === 0 && selection.$from.index(0)>0 && selection.$from.parent.attrs.lineBreaksBefore>0) {current.dispatch(current.state.tr.setNodeMarkup(selection.$from.before(1),undefined,{...selection.$from.parent.attrs,lineBreaksBefore:selection.$from.parent.attrs.lineBreaksBefore-1}));return true;}
        if (event.key === 'Backspace' && selection.$from.parentOffset === 0 && selection.$from.index(0)>0 && selection.$from.parent.attrs.gapBefore) { const boundary=selection.$from.before(1); current.dispatch(current.state.tr.insertText(' ',boundary-1).join(boundary+1).setMeta('manual-boundary',true).setMeta('separator-at',boundary-1));return true; }
        if (event.key === 'Delete' && selection.$from.parentOffset === selection.$from.parent.content.size) {
          const next = current.state.doc.maybeChild(selection.$from.index(0) + 1); if (next?.attrs.protected) return true;if(next&&next.attrs.lineBreaksBefore>0){current.dispatch(current.state.tr.setNodeMarkup(selection.$from.after(1),undefined,{...next.attrs,lineBreaksBefore:next.attrs.lineBreaksBefore-1}));return true;} if(next?.attrs.gapBefore){const boundary=selection.$from.after(1);current.dispatch(current.state.tr.insertText(' ',boundary-1).join(boundary+1).setMeta('manual-boundary',true).setMeta('separator-at',boundary-1));return true;}
        }
        return false;
      },
      handleDOMEvents: {
        focus: () => { activate(); return false; },
        contextmenu:(current,event)=>{if(!latest.current.editable||!latest.current.onTextContextMenu||(event.target as Element).closest('button'))return false;event.preventDefault();const mouse=event as MouseEvent;if(current.state.selection.empty){let point;try{point=current.posAtCoords({left:mouse.clientX,top:mouse.clientY});}catch{/* Selection stays at its known position in environments without hit testing. */}if(point)current.dispatch(current.state.tr.setSelection(TextSelection.near(current.state.doc.resolve(point.pos))));}openTextMenu(current,{x:mouse.clientX,y:mouse.clientY,trigger:current.dom});return true;},
        beforeinput: (current,event) => {
          const input=event as InputEvent;
          if(!latest.current.editable||composing.current||input.isComposing||!input.cancelable||input.data===null||!['insertText','insertReplacementText'].includes(input.inputType))return false;
          // Commit native text before the browser mutates the inline sentence
          // wrappers. Target ranges also cover replacement/autocorrection when
          // the DOM selection has not reached ProseMirror's selection observer.
          const range=input.getTargetRanges?.()[0];
          const from=range?current.posAtDOM(range.startContainer,range.startOffset):current.state.selection.from;
          const to=range?current.posAtDOM(range.endContainer,range.endOffset):current.state.selection.to;
          input.preventDefault();current.dispatch(current.state.tr.insertText(input.data,from,to));return true;
        },
        compositionstart: () => { composing.current = true; return false; },
        compositionend: () => { composing.current = false; queueMicrotask(() => { if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta('segment', true)); }); return false; },
      },
      decorations(state) {
        const decorations: Decoration[] = [];
        state.doc.forEach((node, offset,index) => {
          if(state.selection.$from.index(0)===index)decorations.push(Decoration.node(offset,offset+node.nodeSize,{'data-active':'true'}));
          const block = blocksOf(schema.nodes.doc.create(null, [node]))[0];
          const heading = latest.current.unitLabels?.[block.nodeId]; if (heading) decorations.push(Decoration.widget(offset + 1, () => { const label = document.createElement('button'); label.type = 'button'; label.className = styles.inlineHeading; label.contentEditable = 'false'; label.textContent = heading; label.addEventListener('click', () => latest.current.onSelectUnit?.(block.nodeId)); return label; }, { key:'heading-'+block.nodeId+':'+heading, side:-1, stopEvent:()=>true }));
          for (const reference of block.references.filter(reference => reference.target.type === 'footnote' && reference.target.footnoteId)) {
            const noteId = reference.target.footnoteId!, label = latest.current.notes.find(note => note.logicalId === noteId)?.label ?? '*';
            decorations.push(Decoration.widget(offset + 1 + reference.end, () => {
              const marker = document.createElement('button'); marker.type = 'button';marker.id='editor-ref-'+reference.logicalId;marker.dataset.footnoteMarker=''; marker.className = styles.noteMarker; marker.contentEditable = 'false'; marker.textContent = label; marker.setAttribute('aria-label', latest.current.label.startsWith('Verfassungs') ? 'Fußnote '+label+' anzeigen' : 'Show footnote '+label); marker.setAttribute('aria-haspopup', 'dialog');
              const context=(x:number,y:number):CanvasMarkerContext=>({noteId,referenceId:reference.logicalId,textId:block.textId,nodeId:block.nodeId,anchor:{x,y,trigger:marker}});
              marker.addEventListener('click', event => { event.preventDefault();const rect=marker.getBoundingClientRect();latest.current.onMarkerActivate?.(context(rect.left,rect.bottom)); noteActions.current.showNote(noteId, marker); });
              marker.addEventListener('contextmenu',event=>{if(!latest.current.editable)return;event.preventDefault();event.stopPropagation();latest.current.onMarkerContextMenu?.(context(event.clientX,event.clientY));});
              marker.addEventListener('keydown',event=>{if(!latest.current.editable||event.key!=='ContextMenu'&&!(event.key==='F10'&&event.shiftKey))return;event.preventDefault();event.stopPropagation();const rect=marker.getBoundingClientRect();latest.current.onMarkerContextMenu?.(context(rect.left,rect.bottom));});
              marker.addEventListener('pointerenter', () => noteActions.current.previewNote(noteId, marker)); marker.addEventListener('pointerleave', () => noteActions.current.hidePreview()); marker.addEventListener('focus', () => noteActions.current.previewNote(noteId, marker)); marker.addEventListener('blur', () => noteActions.current.hidePreview());
              return marker;
            }, { key: reference.logicalId+':'+label+':'+block.textId, side: 1, stopEvent: () => true }));
          }
        });
        return DecorationSet.create(state.doc, decorations);
      },
      dispatchTransaction(incoming) {
        const previousState=view.state;
        let transaction = incoming;
        if(!latest.current.editable&&transaction.docChanged){view.updateState(view.state);return;}
        if (transaction.docChanged) {
          transaction=restoreParsedIdentities(transaction,view.state.doc);
          const anchors = new Map<number, OrderedInlineReference[]>(), previousAnchorIds = new Set<string>();
          view.state.doc.forEach(node => (node.attrs.anchors as OrderedInlineReference[]).forEach(reference => previousAnchorIds.add(reference.logicalId)));
          const retainedAnchors = new Map<string, Set<string>>(); transaction.doc.forEach(node => retainedAnchors.set(node.attrs.nodeId, new Set((node.attrs.anchors as OrderedInlineReference[]).map(reference => reference.logicalId))));
          transaction.doc.forEach((node, offset) => { const added = (node.attrs.anchors as OrderedInlineReference[]).filter(reference => !previousAnchorIds.has(reference.logicalId)); if (added.length) anchors.set(offset, added); });
          view.state.doc.forEach((node, offset) => (node.attrs.anchors as OrderedInlineReference[]).forEach(reference => {
            if (retainedAnchors.has(node.attrs.nodeId) && !retainedAnchors.get(node.attrs.nodeId)!.has(reference.logicalId)) return;
            const anchorPosition=offset+1+reference.start, mapped = transaction.mapping.mapResult(anchorPosition, transaction.getMeta('separator-at') === anchorPosition ? -1 : 1); if (mapped.deletedAcross) return;
            const point = transaction.doc.resolve(Math.max(1, Math.min(transaction.doc.content.size - 1, mapped.pos)));
            if (!point.depth) return; const target = point.before(1), list = anchors.get(target) ?? [];
            list.push({ ...reference, start: point.parentOffset, end: point.parentOffset }); anchors.set(target, list);
          }));
          transaction.doc.forEach((node, offset) => { transaction = transaction.setNodeMarkup(offset, undefined, { ...node.attrs, anchors: anchors.get(offset) ?? [] }); });
        }
        let state = view.state.apply(transaction);
        if ((transaction.docChanged || transaction.getMeta('segment') || transaction.getMeta('segment-all')) && latest.current.editable && latest.current.automatic && !composing.current && !transaction.getMeta('manual-boundary')) {
          const originalBlocks = blocksOf(view.state.doc), blocks = blocksOf(state.doc);
          const terminal = (text: string) => latest.current.delimiters.some(delimiter => text.trimEnd().replace(/["'”’“‘»›)\]}]+$/u, '').endsWith(delimiter));
          for (let index = 0; index + 1 < blocks.length; index++) {
            const before = originalBlocks.find(block => block.nodeId === blocks[index].nodeId), next = state.doc.child(index + 1);
            if (before && terminal(before.text) && !terminal(blocks[index].text) && !next.attrs.protected) { const first = blocks[index], second = blocks[index + 1], gap=sentenceSeparator(first,second), offset = first.text.length+gap.length; blocks.splice(index, 2, { ...first, text: first.text + gap + second.text, marks: normalizeMarks([...first.marks, ...second.marks.map(mark => ({ ...mark, start: mark.start + offset, end: mark.end + offset }))]), references: [...first.references, ...second.references.map(reference => ({ ...reference, start: reference.start + offset, end: reference.end + offset }))] }); }
          }
          const segmented = blocks.flatMap(block => {
            const before = originalBlocks.find(previous => previous.nodeId === block.nodeId); if (!transaction.getMeta('segment-all') && (!before || before.text === block.text)) return [block];
            const previousText=before?.text ?? ''; let prefix = 0, suffix = 0; while (prefix < previousText.length && prefix < block.text.length && previousText[prefix] === block.text[prefix]) prefix++; while (suffix < previousText.length - prefix && suffix < block.text.length - prefix && previousText[previousText.length-1-suffix] === block.text[block.text.length-1-suffix]) suffix++; const changedEnd = block.text.length-suffix;
            const parts = segmentBlock(block, latest.current.delimiters); let offset=0; const cuts:number[]=[]; for (const part of parts.slice(0,-1)) { offset+=part.text.length; const punctuationEnd=offset-(part.text.length-part.text.trimEnd().length), extendsTerminal=prefix===previousText.length&&punctuationEnd<=prefix&&previousText.slice(punctuationEnd).trim()===''; if (transaction.getMeta('segment-all') || offset === prefix || extendsTerminal || punctuationEnd > prefix && punctuationEnd <= changedEnd) cuts.push(offset); }
            const boundaries=[0,...cuts,block.text.length]; return boundaries.slice(1).map((end,index)=>({ nodeId:index ? crypto.randomUUID() : block.nodeId, textId:index ? crypto.randomUUID() : block.textId,lineBreaksBefore:index?0:block.lineBreaksBefore??0,...sliceBlock(block,boundaries[index],end) }));
          });
          if (canvasSignature(segmented) !== canvasSignature(blocksOf(state.doc))) {
            const from = flatPosition(state.doc, state.selection.from), to = flatPosition(state.doc, state.selection.to), marks = state.storedMarks;
            const doc = documentOf(segmented, latest.current.units);
            const update = state.tr.replaceWith(0, state.doc.content.size, doc.content);
            update.setSelection(TextSelection.create(update.doc, documentPosition(update.doc, from), documentPosition(update.doc, to))); if (marks) update.setStoredMarks(marks);
            state = state.apply(update);
          }
        }
        view.updateState(state); activate();
        if (transaction.docChanged || transaction.getMeta('segment') || transaction.getMeta('segment-all')) {
          const blocks = blocksOf(state.doc).filter((block, index, all) => block.text.length || index < all.length - 1 || latest.current.units.some(unit => unit.node.logicalId === block.nodeId));
          const signature = canvasSignature(blocks); if (signature !== lastSent.current) {
            const previousSent=lastSent.current;lastSent.current=signature;
            const accepted=latest.current.onChange(blocks, transaction.getMeta('paste') || transaction.getMeta('manual-boundary') || transaction.getMeta('segment-all') ? '' : 'typing:'+latest.current.units[0].node.logicalId);
            if(accepted===false){view.updateState(previousState);lastSent.current=previousSent;activate();return;}
            const canonical=accepted??blocks,canonicalSignature=canvasSignature(canonical);lastSent.current=canonicalSignature;pending.current.push(canonicalSignature);acceptedBlocks.current=new Map(canonical.map(block=>[block.textId,block]));
            // Reconciliation may retarget links after a merge. Commit that
            // accepted rich state now, before a later keystroke can race its
            // React acknowledgement and restore an obsolete target.
            const visible=canonical.map(accepted=>{const raw=blocks.find(block=>block.textId===accepted.textId);if(!latest.current.automatic||!raw||raw.text.trim()!==accepted.text)return accepted;const targets=new Map(accepted.references.map(reference=>[reference.logicalId,reference.target]));return {...raw,references:raw.references.map(reference=>({...reference,target:targets.get(reference.logicalId)??reference.target}))};});
            const doc=documentOf(visible,latest.current.units);
            if(!doc.eq(state.doc)){const from=flatPosition(state.doc,state.selection.from),to=flatPosition(state.doc,state.selection.to),update=state.tr.replaceWith(0,state.doc.content.size,doc.content);update.setSelection(TextSelection.create(update.doc,documentPosition(update.doc,from),documentPosition(update.doc,to)));if(state.storedMarks)update.setStoredMarks(state.storedMarks);view.updateState(state.apply(update));}
          }
        }
        updateFootnoteHitTargets();
      },
    });
    viewRef.current = view;updateFootnoteHitTargets();
    function openTextMenu(current:EditorView,anchor:CanvasMarkerContext['anchor']){current.focus();activate();const selection=current.state.selection,offset=selection.$from.parentOffset,next=current.state.doc.maybeChild(selection.$from.index(0)+1),block=blocksOf(current.state.doc)[selection.$from.index(0)];latest.current.onTextContextMenu?.({anchor,selected:!selection.empty,canSplit:selection.empty&&offset>0&&offset<selection.$from.parent.content.size&&!block.references.some(reference=>reference.start<offset&&reference.end>offset),canMerge:Boolean(selection.empty&&next&&!next.attrs.protected)});}
    function activate() {
      const { $from, $to } = view.state.selection;
      const controller: CanvasController = {
        isAlive: () => !view.isDestroyed,
        format(type) { if(view.isDestroyed)return; toggleMark(schema.marks[type],null,{removeWhenPresent:false})(view.state, view.dispatch, view); view.focus(); },
        focus(position) { if(view.isDestroyed)return; if (position) view.state.doc.forEach((node, offset) => { if (node.attrs.textId === position.textId) {const accepted=acceptedBlocks.current.get(position.textId),leading=latest.current.automatic&&accepted?.text!==node.textContent&&accepted?.text===node.textContent.trim()?node.textContent.length-node.textContent.trimStart().length:0;view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, offset+1+Math.min(leading+position.start,node.content.size), offset+1+Math.min(leading+(position.end ?? position.start),node.content.size))));} }); view.focus(); },
        segment() { if(view.isDestroyed)return; view.dispatch(view.state.tr.setMeta('segment-all',true)); view.focus(); },
        split() { if(view.isDestroyed)return; const point = view.state.selection.from; const block = blocksOf(view.state.doc)[view.state.selection.$from.index(0)]; if (block.references.some(reference => reference.start < view.state.selection.$from.parentOffset && reference.end > view.state.selection.$from.parentOffset)) return; if (!view.state.selection.$from.parentOffset || view.state.selection.$from.parentOffset === view.state.selection.$from.parent.content.size) return; view.dispatch(view.state.tr.split(point, 1, [{ type: schema.nodes.sentence, attrs: { nodeId: crypto.randomUUID(), textId: crypto.randomUUID(), anchors: [], protected: false } }]).setMeta('manual-boundary', true)); view.focus(); },
        merge() { if(view.isDestroyed)return; const after = view.state.selection.$from.after(1); if (after >= view.state.doc.content.size || view.state.doc.nodeAt(after)?.attrs.protected) return; const next=view.state.doc.nodeAt(after)!,gap=next.attrs.lineBreaksBefore?'\n'.repeat(next.attrs.lineBreaksBefore):next.attrs.gapBefore?' ':'', transaction=view.state.tr; if(gap)transaction.insertText(gap,after-1).setMeta('separator-at',after-1); view.dispatch(transaction.join(after+gap.length).setMeta('manual-boundary', true)); view.focus(); },
        addReference(target) { if(view.isDestroyed)return false; const { from, to, $from } = view.state.selection; if (!target || $from.parent !== view.state.selection.$to.parent || (!target.footnoteId && from === to)) return false; const start = $from.parentOffset, end = view.state.selection.$to.parentOffset, refs = blocksOf(view.state.doc)[view.state.selection.$from.index(0)].references; if (refs.some(reference => start === end ? reference.start < start && reference.end > end : start < reference.end && end > reference.start || reference.start === reference.end && start < reference.start && end > reference.end)) return false; if (from === to) { const at = $from.before(1), anchors = [...$from.parent.attrs.anchors, { logicalId: crypto.randomUUID(), start: $from.parentOffset, end: $from.parentOffset, target }]; view.dispatch(view.state.tr.setNodeMarkup(at, undefined, { ...$from.parent.attrs, anchors })); } else view.dispatch(view.state.tr.addMark(from, to, schema.marks.reference.create({ id: crypto.randomUUID(), target }))); view.focus(); return true; },
        endAnchor(){if(view.isDestroyed)return {nodeId:'',textId:'',start:0,end:0};const point=view.state.selection.$to,node=point.depth?point.parent:view.state.doc.lastChild!,offset=point.depth?point.parentOffset:node.content.size,accepted=acceptedBlocks.current.get(node.attrs.textId),clean=latest.current.automatic&&accepted?.text!==node.textContent&&accepted?.text===node.textContent.trim(),leading=clean?node.textContent.length-node.textContent.trimStart().length:0,length=clean?accepted!.text.length:node.content.size,end=Math.max(0,Math.min(length,offset-leading));return {nodeId:node.attrs.nodeId,textId:node.attrs.textId,start:end,end};},
        selection() { if(view.isDestroyed)return {nodeId:'',textId:'',start:0,end:0}; const selection = view.state.selection,node=selection.$from.parent,accepted=acceptedBlocks.current.get(node.attrs.textId),clean=latest.current.automatic&&accepted?.text!==node.textContent&&accepted?.text===node.textContent.trim(),leading=clean?node.textContent.length-node.textContent.trimStart().length:0,length=clean?accepted!.text.length:node.content.size,point=(offset:number)=>Math.max(0,Math.min(length,offset-leading));return { nodeId: node.attrs.nodeId, textId: node.attrs.textId, start: point(selection.$from.parentOffset), end: point(selection.$to.parent === node ? selection.$to.parentOffset : node.content.size) }; },
        activeMarks() { if(view.isDestroyed)return []; const {from,to,empty}=view.state.selection;if(empty)return(view.state.storedMarks??view.state.selection.$from.marks()).map(mark=>mark.type.name);const coverage=new Map<string,number>();let total=0;view.state.doc.nodesBetween(from,to,(node,offset)=>{if(!node.isText)return;const length=Math.max(0,Math.min(to,offset+node.nodeSize)-Math.max(from,offset));total+=length;for(const mark of node.marks)coverage.set(mark.type.name,(coverage.get(mark.type.name)??0)+length);});return [...coverage].filter(([,length])=>length>0).map(([type,length])=>length===total?type:'mixed:'+type); },
      };
      latest.current.onActivate(controller, $from.parent.attrs.textId || latest.current.units[0].entry.logicalId!);
      void $to;
    }
    const initial=latest.current.units.map(blockOf);lastSent.current = lastReceived.current = canvasSignature(initial);acceptedBlocks.current=new Map(initial.map(block=>[block.textId,block]));
    return () => { view.destroy(); viewRef.current = null; };
  }, []);
  useEffect(() => {
    const view = viewRef.current; if (!view) return;
    const incoming = props.units.map(blockOf), signature = canvasSignature(incoming);
    const decorationSignature=JSON.stringify([props.editable,props.notes,props.unitLabels,props.units.map(unit=>[unit.node.logicalId,unit.node.label,unit.node.title])]);
    const acknowledgement=pending.current.lastIndexOf(signature), changed=signature!==lastReceived.current, reset=receivedReset.current!==props.resetVersion;
    receivedReset.current=props.resetVersion;
    lastReceived.current=signature;
    if(acknowledgement>=0)pending.current.splice(0,acknowledgement+1);
    const external=reset||changed&&acknowledgement<0;
    const incomingDoc=documentOf(external?incoming:blocksOf(view.state.doc),props.units);
    if (!incomingDoc.eq(view.state.doc)) {
      const previous = view.state.selection, from = flatPosition(view.state.doc, previous.from), to = flatPosition(view.state.doc, previous.to), doc = incomingDoc;
      const state = EditorState.create({ doc, plugins: view.state.plugins, selection: TextSelection.create(doc, documentPosition(doc, from), documentPosition(doc, to)),storedMarks:view.state.storedMarks });
      view.updateState(state);
    }
    if(external){lastSent.current=signature;pending.current=[];acceptedBlocks.current=new Map(incoming.map(block=>[block.textId,block]));}
    if(presentation.current!==decorationSignature){presentation.current=decorationSignature;view.setProps({ editable: () => latest.current.editable });}
  }, [props.units, props.editable,props.notes,props.unitLabels,props.resetVersion]);
  return <div className={[styles.canvas, props.flowing ? styles.flowing : styles.lines, props.boundaries ? styles.boundaries : '',props.active?styles.activeCanvas:''].join(' ')} ref={host} />;
}
