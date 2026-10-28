'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { Schema, type Node as ProseNode } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import type { OrderedInlineReference, OrderedTextMark } from '../../lib/api';
import { blockOf, normalizeMarks, segmentBlock, sliceBlock, type CanvasBlock, type CanvasUnit } from '../../lib/continuous-editor';
import { useFootnoteActions } from '../components/Footnotes';
import styles from './compact-editor.module.css';

const schema = new Schema({
  nodes: {
    doc: { content: 'sentence+' },
    sentence: { content: 'text*', group: 'block', attrs: { nodeId: { default: '' }, textId: { default: '' }, protected: { default: false }, anchors: { default: [] }, gapBefore: { default: false } }, toDOM: node => ['span', { class: 'ce-sentence', 'data-unit': node.attrs.nodeId, 'data-editor-entry': node.attrs.textId, 'data-gap': String(node.attrs.gapBefore) }, 0], parseDOM: [{ tag: 'span.ce-sentence' }, { tag: 'p' }] },
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
    return schema.nodes.sentence.create({ nodeId: block.nodeId, textId: block.textId, protected: Boolean(source?.node.label || source?.node.title), anchors: block.references.filter(reference => reference.start === reference.end), gapBefore: index > 0 && !/\s$/u.test(blocks[index-1].text) && !/^\s/u.test(block.text) }, inline);
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
    result.push({ nodeId: node.attrs.nodeId || crypto.randomUUID(), textId: node.attrs.textId || crypto.randomUUID(), text: node.textContent, marks: normalizeMarks(marks), references: references.sort((a, b) => a.start - b.start || a.end - b.end) });
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

export type CanvasController = { isAlive: () => boolean; format: (type: OrderedTextMark['type']) => void; focus: (position?: { textId: string; start: number; end?: number }) => void; segment: () => void; split: () => void; merge: () => void; addReference: (target: OrderedInlineReference['target']) => boolean; selection: () => { textId: string; nodeId: string; start: number; end: number }; activeMarks: () => string[] };
type Props = { units: CanvasUnit[]; label: string; editable: boolean; flowing: boolean; boundaries: boolean; automatic: boolean; delimiters: string[]; notes: { logicalId: string; label: string }[]; unitLabels?: Record<string, string>; onSelectUnit?: (id: string) => void; onChange: (blocks: CanvasBlock[], grouping: string) => void; onActivate: (controller: CanvasController, textId: string) => void; onUndo: () => void; onRedo: () => void };

export function ContinuousCanvas(props: Props) {
  const host = useRef<HTMLDivElement>(null), viewRef = useRef<EditorView | null>(null), latest = useRef(props), composing = useRef(false), lastSent = useRef('');
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
      handlePaste(current, event) { if(!latest.current.editable)return true;const text = event.clipboardData?.getData('text/plain'); if (text === undefined) return false; current.dispatch(current.state.tr.insertText(text).setMeta('paste', true)); return true; },
      handleKeyDown(current, event) {
        const selection = current.state.selection;
        if (!selection.empty) return false;
        const depth = selection.$from.depth;
        if (!depth) return false;
        if (event.key === 'Backspace' && selection.$from.parentOffset === 0 && selection.$from.parent.attrs.protected) return true;
        if (event.key === 'Backspace' && selection.$from.parentOffset === 0 && selection.$from.index(0)>0 && selection.$from.parent.attrs.gapBefore) { const boundary=selection.$from.before(1); current.dispatch(current.state.tr.insertText(' ',boundary-1).join(boundary+1).setMeta('manual-boundary',true).setMeta('separator-at',boundary-1));return true; }
        if (event.key === 'Delete' && selection.$from.parentOffset === selection.$from.parent.content.size) {
          const next = current.state.doc.maybeChild(selection.$from.index(0) + 1); if (next?.attrs.protected) return true; if(next?.attrs.gapBefore){const boundary=selection.$from.after(1);current.dispatch(current.state.tr.insertText(' ',boundary-1).join(boundary+1).setMeta('manual-boundary',true).setMeta('separator-at',boundary-1));return true;}
        }
        return false;
      },
      handleDOMEvents: {
        focus: () => { activate(); return false; },
        compositionstart: () => { composing.current = true; return false; },
        compositionend: () => { composing.current = false; queueMicrotask(() => { if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta('segment', true)); }); return false; },
      },
      decorations(state) {
        const decorations: Decoration[] = [];
        state.doc.forEach((node, offset) => {
          const block = blocksOf(schema.nodes.doc.create(null, [node]))[0];
          const heading = latest.current.unitLabels?.[block.nodeId]; if (heading) decorations.push(Decoration.widget(offset + 1, () => { const label = document.createElement('button'); label.type = 'button'; label.className = styles.inlineHeading; label.contentEditable = 'false'; label.textContent = heading; label.addEventListener('click', () => latest.current.onSelectUnit?.(block.nodeId)); return label; }, { key:'heading-'+block.nodeId+':'+heading, side:-1, stopEvent:()=>true }));
          for (const reference of block.references.filter(reference => reference.target.type === 'footnote' && reference.target.footnoteId)) {
            const noteId = reference.target.footnoteId!, label = latest.current.notes.find(note => note.logicalId === noteId)?.label ?? '*';
            decorations.push(Decoration.widget(offset + 1 + reference.end, () => {
              const marker = document.createElement('button'); marker.type = 'button'; marker.className = styles.noteMarker; marker.contentEditable = 'false'; marker.textContent = label; marker.setAttribute('aria-label', latest.current.label.startsWith('Verfassungs') ? 'Fußnote '+label+' anzeigen' : 'Show footnote '+label); marker.setAttribute('aria-haspopup', 'dialog');
              marker.addEventListener('click', event => { event.preventDefault(); noteActions.current.showNote(noteId, marker); });
              marker.addEventListener('pointerenter', () => noteActions.current.previewNote(noteId, marker)); marker.addEventListener('pointerleave', () => noteActions.current.hidePreview()); marker.addEventListener('focus', () => noteActions.current.previewNote(noteId, marker)); marker.addEventListener('blur', () => noteActions.current.hidePreview());
              return marker;
            }, { key: reference.logicalId+':'+label, side: 1, stopEvent: () => true }));
          }
        });
        return DecorationSet.create(state.doc, decorations);
      },
      dispatchTransaction(incoming) {
        let transaction = incoming;
        if(!latest.current.editable&&transaction.docChanged){view.updateState(view.state);return;}
        if (transaction.docChanged) {
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
            if (before && terminal(before.text) && !terminal(blocks[index].text) && !next.attrs.protected) { const first = blocks[index], second = blocks[index + 1], gap=next.attrs.gapBefore?' ':'', offset = first.text.length+gap.length; blocks.splice(index, 2, { ...first, text: first.text + gap + second.text, marks: normalizeMarks([...first.marks, ...second.marks.map(mark => ({ ...mark, start: mark.start + offset, end: mark.end + offset }))]), references: [...first.references, ...second.references.map(reference => ({ ...reference, start: reference.start + offset, end: reference.end + offset }))] }); }
          }
          const segmented = blocks.flatMap(block => {
            const before = originalBlocks.find(previous => previous.nodeId === block.nodeId); if (!transaction.getMeta('segment-all') && (!before || before.text === block.text)) return [block];
            const previousText=before?.text ?? ''; let prefix = 0, suffix = 0; while (prefix < previousText.length && prefix < block.text.length && previousText[prefix] === block.text[prefix]) prefix++; while (suffix < previousText.length - prefix && suffix < block.text.length - prefix && previousText[previousText.length-1-suffix] === block.text[block.text.length-1-suffix]) suffix++; const changedEnd = block.text.length-suffix;
            const parts = segmentBlock(block, latest.current.delimiters); let offset=0; const cuts:number[]=[]; for (const part of parts.slice(0,-1)) { offset+=part.text.length; const punctuationEnd=offset-(part.text.length-part.text.trimEnd().length); if (transaction.getMeta('segment-all') || offset === prefix || punctuationEnd > prefix && punctuationEnd <= changedEnd) cuts.push(offset); }
            const boundaries=[0,...cuts,block.text.length]; return boundaries.slice(1).map((end,index)=>({ nodeId:index ? crypto.randomUUID() : block.nodeId, textId:index ? crypto.randomUUID() : block.textId,...sliceBlock(block,boundaries[index],end) }));
          });
          if (JSON.stringify(segmented) !== JSON.stringify(blocksOf(state.doc))) {
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
          const signature = JSON.stringify(blocks); if (signature !== lastSent.current) { lastSent.current = signature; latest.current.onChange(blocks, transaction.getMeta('paste') || transaction.getMeta('manual-boundary') || transaction.getMeta('segment-all') ? '' : 'typing:'+latest.current.units[0].node.logicalId); }
        }
      },
    });
    viewRef.current = view;
    function activate() {
      const { $from, $to } = view.state.selection;
      const controller: CanvasController = {
        isAlive: () => !view.isDestroyed,
        format(type) { if(view.isDestroyed)return; toggleMark(schema.marks[type],null,{removeWhenPresent:false})(view.state, view.dispatch, view); view.focus(); },
        focus(position) { if(view.isDestroyed)return; if (position) view.state.doc.forEach((node, offset) => { if (node.attrs.textId === position.textId) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, offset+1+Math.min(position.start,node.content.size), offset+1+Math.min(position.end ?? position.start,node.content.size)))); }); view.focus(); },
        segment() { if(view.isDestroyed)return; view.dispatch(view.state.tr.setMeta('segment-all',true)); view.focus(); },
        split() { if(view.isDestroyed)return; const point = view.state.selection.from; const block = blocksOf(view.state.doc)[view.state.selection.$from.index(0)]; if (block.references.some(reference => reference.start < view.state.selection.$from.parentOffset && reference.end > view.state.selection.$from.parentOffset)) return; if (!view.state.selection.$from.parentOffset || view.state.selection.$from.parentOffset === view.state.selection.$from.parent.content.size) return; view.dispatch(view.state.tr.split(point, 1, [{ type: schema.nodes.sentence, attrs: { nodeId: crypto.randomUUID(), textId: crypto.randomUUID(), anchors: [], protected: false } }]).setMeta('manual-boundary', true)); view.focus(); },
        merge() { if(view.isDestroyed)return; const after = view.state.selection.$from.after(1); if (after >= view.state.doc.content.size || view.state.doc.nodeAt(after)?.attrs.protected) return; const gap=view.state.doc.nodeAt(after)?.attrs.gapBefore, transaction=view.state.tr; if(gap)transaction.insertText(' ',after-1).setMeta('separator-at',after-1); view.dispatch(transaction.join(after+(gap?1:0)).setMeta('manual-boundary', true)); view.focus(); },
        addReference(target) { if(view.isDestroyed)return false; const { from, to, $from } = view.state.selection; if (!target || $from.parent !== view.state.selection.$to.parent || (!target.footnoteId && from === to)) return false; const start = $from.parentOffset, end = view.state.selection.$to.parentOffset, refs = blocksOf(view.state.doc)[view.state.selection.$from.index(0)].references; if (refs.some(reference => start === end ? reference.start < start && reference.end > end : start < reference.end && end > reference.start || reference.start === reference.end && start < reference.start && end > reference.end)) return false; if (from === to) { const at = $from.before(1), anchors = [...$from.parent.attrs.anchors, { logicalId: crypto.randomUUID(), start: $from.parentOffset, end: $from.parentOffset, target }]; view.dispatch(view.state.tr.setNodeMarkup(at, undefined, { ...$from.parent.attrs, anchors })); } else view.dispatch(view.state.tr.addMark(from, to, schema.marks.reference.create({ id: crypto.randomUUID(), target }))); view.focus(); return true; },
        selection() { if(view.isDestroyed)return {nodeId:'',textId:'',start:0,end:0}; const selection = view.state.selection; return { nodeId: selection.$from.parent.attrs.nodeId, textId: selection.$from.parent.attrs.textId, start: selection.$from.parentOffset, end: selection.$to.parent === selection.$from.parent ? selection.$to.parentOffset : selection.$from.parent.content.size }; },
        activeMarks() { if(view.isDestroyed)return []; const {from,to,empty}=view.state.selection;if(empty)return(view.state.storedMarks??view.state.selection.$from.marks()).map(mark=>mark.type.name);const coverage=new Map<string,number>();let total=0;view.state.doc.nodesBetween(from,to,(node,offset)=>{if(!node.isText)return;const length=Math.max(0,Math.min(to,offset+node.nodeSize)-Math.max(from,offset));total+=length;for(const mark of node.marks)coverage.set(mark.type.name,(coverage.get(mark.type.name)??0)+length);});return [...coverage].filter(([,length])=>length>0).map(([type,length])=>length===total?type:'mixed:'+type); },
      };
      latest.current.onActivate(controller, $from.parent.attrs.textId || latest.current.units[0].entry.logicalId!);
      void $to;
    }
    lastSent.current = JSON.stringify(latest.current.units.map(blockOf));
    return () => { view.destroy(); viewRef.current = null; };
  }, []);
  useEffect(() => {
    const view = viewRef.current; if (!view) return;
    const incoming = props.units.map(blockOf), signature = JSON.stringify(incoming), incomingDoc = documentOf(incoming, props.units);
    if (!incomingDoc.eq(view.state.doc)) {
      const previous = view.state.selection, from = flatPosition(view.state.doc, previous.from), to = flatPosition(view.state.doc, previous.to), doc = incomingDoc;
      const state = EditorState.create({ doc, plugins: view.state.plugins, selection: TextSelection.create(doc, documentPosition(doc, from), documentPosition(doc, to)) });
      view.updateState(state); lastSent.current = signature;
    }
    view.setProps({ editable: () => latest.current.editable });
  }, [props.units, props.editable]);
  return <div className={[styles.canvas, props.flowing ? styles.flowing : styles.lines, props.boundaries ? styles.boundaries : ''].join(' ')} ref={host} />;
}
