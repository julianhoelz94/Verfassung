import type { ArticleSummary, OrderedEntry } from './api';

export function orderedTargets(roots: Pick<ArticleSummary, 'id' | 'logicalId' | 'content'>[]): Record<string, { rootId: string; occurrenceId: string }> {
  const result: Record<string, { rootId: string; occurrenceId: string }> = {};
  function visit(entries: OrderedEntry[], rootId: string) {
    for (const entry of entries) {
      if (entry.node) {
        result[entry.node.logicalId] = { rootId, occurrenceId: entry.node.occurrenceId };
        visit(entry.node.content, rootId);
      } else if (entry.logicalId && entry.occurrenceId) result[entry.logicalId] = { rootId, occurrenceId: entry.occurrenceId };
    }
  }
  for (const root of roots) {
    if (root.logicalId) result[root.logicalId] = { rootId: root.id, occurrenceId: root.id };
    visit(root.content ?? [], root.id);
  }
  return result;
}

/** Adjacent text concatenates exactly; child boundaries supply only missing whitespace. */
export function orderedText(entries: OrderedEntry[]): string {
  let text = '';
  let previousChild = false;
  for (const entry of entries) {
    const child = entry.type === 'child';
    const part = entry.type === 'text' && entry.text != null ? entry.text : child && entry.node ? orderedText(entry.node.content) : null;
    if (part == null) throw new Error('Invalid ordered content entry');
    const breaks = entry.type === 'text' ? '\n'.repeat(entry.lineBreaksBefore ?? 0) : '';
    if (!part && !breaks) continue;
    text += breaks + (text && !breaks && (child || previousChild) && !/\s$/u.test(text) && !/^\s/u.test(part) ? ' ' : '') + part;
    previousChild = child;
  }
  return text;
}
