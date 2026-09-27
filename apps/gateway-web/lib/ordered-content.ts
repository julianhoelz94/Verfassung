import type { OrderedEntry } from './api';

/** Adjacent text concatenates exactly; child boundaries supply only missing whitespace. */
export function orderedText(entries: OrderedEntry[]): string {
  let text = '';
  let previousChild = false;
  for (const entry of entries) {
    const child = entry.type === 'child';
    const part = entry.type === 'text' && entry.text != null ? entry.text : child && entry.node ? orderedText(entry.node.content) : null;
    if (part == null) throw new Error('Invalid ordered content entry');
    if (!part) continue;
    text += (text && (child || previousChild) && !/\s$/u.test(text) && !/^\s/u.test(part) ? ' ' : '') + part;
    previousChild = child;
  }
  return text;
}
