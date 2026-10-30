import type { ArticleSummary, ContentNode, ContentOutline, OrderedEntry } from './api';
import { footnoteEntries } from './footnotes';
import { articleHeading, effectiveDisplayKind, kindByCode, nodeHeading } from './outline';

export type PassageKind = 'constitution' | 'article' | 'paragraph' | 'sentence' | 'unit';
export type Passage = { id: string; parentId?: string; kind: PassageKind; kindLabel?: string; label: string; href: string; text: string };
export type ReaderActionIndex = { passages: Map<string, Passage>; references: Map<string, string>; constitution: Passage };

function kindOf(kind: string, outline?: ContentOutline): PassageKind {
  return kind === 'sentence' || kindByCode(outline, kind)?.segmentation === 'sentence' ? 'sentence'
    : kind === 'paragraph' ? 'paragraph' : kind === 'article' ? 'article' : 'unit';
}
function headingFor(kind: string, label: string | null | undefined, title: string | null | undefined, outline?: ContentOutline) {
  const settings = effectiveDisplayKind(kindByCode(outline, kind));
  const heading = nodeHeading(settings, { kind, label: label ?? null, number: null, title: title ?? null });
  const inline = settings?.showLabel && ['inline', 'superscript'].includes(settings.labelPlacement ?? '') ? label : null;
  return [heading, inline].filter(Boolean).join(' ');
}
/** Copy the published original, excluding UI and preserving literal labels and authored breaks. */
export function originalEntriesText(entries: OrderedEntry[], outline?: ContentOutline, noteLabels?: Map<string, string>): string {
  let result = '', previousChild = false, previousBlock = false;
  for (const entry of entries) {
    const child = Boolean(entry.node), block = entry.format === 'footnote' || entry.format === 'table';
    const kind = entry.node ? effectiveDisplayKind(kindByCode(outline, entry.node.kind)) : undefined;
    const value = entry.node ? [headingFor(entry.node.kind, entry.node.label, entry.node.title, outline), originalEntriesText(entry.node.content, outline, noteLabels)].filter(Boolean).join('\n')
      : entry.format === 'table' && entry.table ? [entry.table.caption, ...entry.table.rows.map(row => row.cells.map(cell => cell.text).join('\t'))].filter(value => value != null && value !== '').join('\n')
      : entry.format === 'footnote' ? (entry.footnoteLabel ?? '*') + ' ' + (entry.text ?? '') : textWithNoteMarks(entry, noteLabels);
    const breaks = entry.node ? '' : '\n'.repeat(entry.lineBreaksBefore ?? 0);
    const separator = result && value && !breaks && !/\s$/u.test(result) && !/^\s/u.test(value) && (child || previousChild || block || previousBlock)
      ? block || previousBlock ? '\n' : child && kind?.presentation !== 'concatenated' ? '\n\n' : ' ' : '';
    result += breaks + separator + value; previousChild = child; previousBlock = block;
  }
  return result;
}
function textWithNoteMarks(entry: OrderedEntry, labels?: Map<string, string>): string {
  const source = entry.text ?? ''; let result = '', cursor = 0;
  for (const reference of [...(entry.references ?? [])].sort((a,b) => a.start-b.start)) {
    const label = reference.target.type === 'footnote' && reference.target.footnoteId ? labels?.get(reference.target.footnoteId) : undefined;
    if (label == null || reference.start !== reference.end || reference.start < cursor || reference.start > source.length) continue;
    result += source.slice(cursor, reference.start) + label; cursor = reference.start;
  }
  return result + source.slice(cursor);
}
function bodyEntries(entries: OrderedEntry[]): OrderedEntry[] {
  return entries.filter(entry => entry.format !== 'footnote').map(entry => entry.node ? {...entry,node:{...entry.node,content:bodyEntries(entry.node.content)}} : entry);
}
function legacyText(node: ContentNode, outline?: ContentOutline): string {
  return [headingFor(node.kind, node.label ?? node.number, node.title, outline), node.body,
    ...node.children.map(child => legacyText(child, outline))].filter(Boolean).join('\n');
}
export function readerActionIndex(articles: ArticleSummary[], versionHref: string, title: string, outline?: ContentOutline): ReaderActionIndex {
  const passages = new Map<string, Passage>(), references = new Map<string, string>();
  const notes = footnoteEntries(articles.flatMap(article => article.content ?? []));
  const noteLabels = new Map(notes.flatMap(note => note.logicalId ? [[note.logicalId,note.footnoteLabel ?? '*'] as const] : []));
  const bodyText = (entries: OrderedEntry[]) => originalEntriesText(bodyEntries(entries),outline,noteLabels);
  const constitution: Passage = { id: 'reader-document', kind: 'constitution', label: title, href: versionHref,
    text: [title, articles.map(article => [articleHeading(outline, article), article.content != null ? bodyText(article.content) : article.children?.length ? article.children.map(node => legacyText(node, outline)).join('\n\n') : article.body].filter(Boolean).join('\n')).join('\n\n'), originalEntriesText(notes,outline,noteLabels)].filter(Boolean).join('\n\n') };
  passages.set(constitution.id, constitution);
  function indexEntries(entries: OrderedEntry[], parent: Passage, path: string) {
    let plain: OrderedEntry[] = [];
    function flush() {
      if (!plain.length) return;
      const first = plain.find(entry => entry.occurrenceId);
      const paragraph = first && parent.kind === 'article' ? { id: first.occurrenceId!, parentId: parent.id, kind: 'paragraph' as const, label: '', href: versionHref + '#' + encodeURIComponent(first.occurrenceId!), text: bodyText(plain) } : parent;
      for (const entry of plain) {
        if (entry.occurrenceId) passages.set(entry.occurrenceId, paragraph);
        for (const reference of entry.references ?? []) if (reference.target.type === 'footnote') references.set(reference.logicalId, path);
      }
      plain = [];
    }
    let sentence = 0;
    for (const entry of entries) {
      if (!entry.node && (!entry.format || entry.format === 'plain')) { plain.push(entry); continue; }
      flush();
      if (entry.node) {
        const node = entry.node, kind = kindOf(node.kind, outline), settings = kindByCode(outline, node.kind);
        if (kind === 'sentence') sentence++;
        const label = [settings?.displayLabel ?? (kind === 'unit' ? node.kind : ''), node.label ?? (kind === 'sentence' ? String(sentence) : ''), node.title].filter(Boolean).join(' ');
        const passage: Passage = { id: node.occurrenceId, parentId: parent.id, kind, kindLabel: kind === 'unit' ? settings?.displayLabel ?? node.kind : undefined, label,
          href: versionHref + '#' + encodeURIComponent(node.occurrenceId), text: [headingFor(node.kind, node.label, node.title, outline), bodyText(node.content)].filter(Boolean).join('\n') };
        passages.set(passage.id, passage); indexEntries(node.content, passage, [path, label].filter(Boolean).join(' · '));
      }
    }
    flush();
  }
  function indexLegacy(nodes: ContentNode[], parent: Passage) {
    for (const node of nodes) {
      const passage: Passage = { id: node.id, parentId: parent.id, kind: kindOf(node.kind, outline), label: [node.label ?? node.number, node.title].filter(Boolean).join(' '),
        kindLabel: kindByCode(outline, node.kind)?.displayLabel, href: versionHref + '#' + encodeURIComponent(node.id), text: legacyText(node, outline) };
      passages.set(node.id, passage); indexLegacy(node.children, passage);
    }
  }
  for (const article of articles) {
    const label = articleHeading(outline, article);
    const passage: Passage = { id: article.id, parentId: constitution.id, kind: kindOf(article.kind ?? 'article', outline), kindLabel: article.kind && article.kind !== 'article' ? kindByCode(outline, article.kind)?.displayLabel : undefined,
      label, href: versionHref + '#unit-' + encodeURIComponent(article.id), text: [label, article.content != null ? bodyText(article.content) : article.children?.length ? article.children.map(node => legacyText(node, outline)).join('\n\n') : article.body].filter(Boolean).join('\n') };
    passages.set(article.id, passage); passages.set('unit-' + article.id, passage);
    indexEntries(article.content ?? [], passage, label); indexLegacy(article.children ?? [], passage);
  }
  return { passages, references, constitution };
}
/** Start at the clicked unit and walk only its actual ancestors; never invent sentences. */
export function passageChoices(index: ReaderActionIndex, element: Element | null): Passage[] {
  let passage: Passage | undefined;
  for (let current = element; current && !passage; current = current.parentElement) passage = index.passages.get(current.id);
  const result: Passage[] = [], seen = new Set<string>();
  let current: Passage | undefined = passage ?? index.constitution;
  while (current && !seen.has(current.id)) {
    seen.add(current.id); result.push(current); current = current.parentId ? index.passages.get(current.parentId) : undefined;
  }
  return result;
}
