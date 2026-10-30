import type { OrderedEntry, OrderedTextMark } from './api';

export type FootnoteItem = { logicalId: string; label: string; text: string; href: string; marks?: OrderedTextMark[]; references?: { id: string; label: string }[] };

/** One index per pinned version, shared by every marker instead of fetched per reference. */
export function footnoteItems(entries: OrderedEntry[], hrefPrefix = '', idPrefix = ''): FootnoteItem[] {
  return footnoteEntries(entries).flatMap(entry => entry.logicalId ? [{
    logicalId: entry.logicalId, label: entry.footnoteLabel ?? '*', text: entry.text ?? '',
    href: hrefPrefix + '#' + idPrefix + 'fn-' + (entry.occurrenceId ?? entry.logicalId),
    marks: entry.marks,
  }] : []);
}

export function footnoteEntries(entries: OrderedEntry[]): OrderedEntry[] {
  return entries.flatMap(entry => entry.node ? footnoteEntries(entry.node.content) : entry.format === 'footnote' ? [entry] : []);
}

export function footnoteBacklinks(entries: OrderedEntry[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  function walk(items: OrderedEntry[]) {
    for (const entry of items) {
      if (entry.node) walk(entry.node.content);
      for (const ref of entry.references ?? []) if (ref.target.type === 'footnote' && ref.target.footnoteId) result.set(ref.target.footnoteId, [...(result.get(ref.target.footnoteId) ?? []), ref.logicalId]);
    }
  }
  walk(entries); return result;
}
