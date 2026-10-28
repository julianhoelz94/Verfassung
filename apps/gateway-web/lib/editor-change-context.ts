import { nodes, readerNode, type DraftNode } from './structured-editor';
import { orderedText } from './ordered-content';

/** Small readable context is attached before the gateway projects unloaded branches. */
export function changeExcerpt(roots: DraftNode[], id: string): string | undefined {
  const all = nodes(roots), unit = all.find(node => node.logicalId === id);
  if (unit) return [unit.label, unit.title, orderedText(readerNode(unit).content)].filter(Boolean).join('\n');
  return all.flatMap(node => node.content).find(entry => entry.logicalId === id)?.text ?? undefined;
}
