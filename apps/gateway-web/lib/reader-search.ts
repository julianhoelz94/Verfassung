export type ReaderMatch = { range: Range; element: HTMLElement };

/** Search original-text ranges, including phrases spanning emphasis and links, without rewriting the DOM. */
export function findReaderText(container: HTMLElement, query: string): ReaderMatch[] {
  const needle = query.trim();
  if (!needle) return [];
  const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  const document = container.ownerDocument;
  const groups = new Map<HTMLElement, Text[]>();
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) { return node.parentElement?.closest('button, [role="button"], [data-reader-chrome], script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; },
  });
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const block = node.parentElement?.closest<HTMLElement>('h2, h3, p, .legal-footnote, caption, td, th') ?? container;
    groups.set(block, [...(groups.get(block) ?? []), node]);
  }
  const results: ReaderMatch[] = [];
  for (const [element, nodes] of groups) {
    for (const match of nodes.map(node => node.data).join('').matchAll(pattern)) {
      const start = match.index!, end = start + match[0].length;
      const range = document.createRange();
      let offset = 0, started = false;
      for (const node of nodes) {
        if (!started && start < offset + node.length) { range.setStart(node, start - offset); started = true; }
        if (started && end <= offset + node.length) { range.setEnd(node, end - offset); break; }
        offset += node.length;
      }
      if (started) results.push({ range, element });
    }
  }
  return results;
}

type HighlightRegistry = { set(name: string, highlight: unknown): void; delete(name: string): void };
type HighlightApi = { CSS?: { highlights?: HighlightRegistry }; Highlight?: new (...ranges: Range[]) => unknown };
export function highlightReaderMatches(matches: ReaderMatch[], active: number): void {
  const api = globalThis as unknown as HighlightApi, registry = api.CSS?.highlights;
  if (!registry || !api.Highlight) return;
  registry.set('reader-find', new api.Highlight(...matches.map(match => match.range)));
  registry.set('reader-current', new api.Highlight(...(matches[active] ? [matches[active].range] : [])));
}
export function clearReaderHighlights(): void {
  const api = globalThis as unknown as HighlightApi;
  api.CSS?.highlights?.delete('reader-find'); api.CSS?.highlights?.delete('reader-current');
}
