import type { OrderedEntry } from './api';

/** Preserve stored bytes; insert a space only where neither boundary supplies whitespace. */
export function orderedText(entries: OrderedEntry[]): string {
  return entries.map((entry) => {
    if (entry.type === 'text' && entry.text != null) return entry.text;
    if (entry.type === 'child' && entry.node) return orderedText(entry.node.content);
    throw new Error('Invalid ordered content entry');
  }).reduce((text, part) => {
    if (!part) return text;
    return text + (text && !/\s$/u.test(text) && !/^\s/u.test(part) ? ' ' : '') + part;
  }, '');
}
