import type { ArticleDetail, ArticleSummary, ContentNode, ContentOutline, OrderedEntry, OutlineKindWrite } from './api';

export function asOutlinePresentation(value: string | undefined): OutlineKindWrite['presentation'] {
  return value === 'concatenated' ? 'concatenated' : 'section';
}

export function toOutlineKindWrite(kind: {
  kindCode: string;
  displayLabel: string;
  presentation?: string;
  showLabel?: boolean;
  showTitle?: boolean;
  showKind?: boolean;
  allowTextAlongsideChildren?: boolean;
  titlePolicy?: string;
  labelPolicy?: string;
  labelPlacement?: string;
  segmentation?: string;
}): OutlineKindWrite {
  const presentation = asOutlinePresentation(kind.presentation);
  return {
    kindCode: kind.kindCode,
    displayLabel: kind.displayLabel,
    presentation,
    showLabel: Boolean(kind.showLabel),
    showTitle: Boolean(kind.showTitle),
    showKind: Boolean(kind.showKind),
    allowTextAlongsideChildren: Boolean(kind.allowTextAlongsideChildren),
    titlePolicy: (kind.titlePolicy ?? 'optional') as OutlineKindWrite['titlePolicy'],
    labelPolicy: (kind.labelPolicy ?? 'optional') as OutlineKindWrite['labelPolicy'],
    labelPlacement: (kind.labelPlacement ?? 'before_title') as OutlineKindWrite['labelPlacement'],
    segmentation: (kind.segmentation ?? 'plain') as OutlineKindWrite['segmentation'],
  };
}

export const DEFAULT_NEW_OUTLINE: OutlineKindWrite[] = [
  {
    kindCode: 'article',
    displayLabel: 'Article',
    presentation: 'section',
    showLabel: true,
    showTitle: true,
    showKind: true,
  },
  {
    kindCode: 'paragraph',
    displayLabel: 'Paragraph',
    presentation: 'section',
    showLabel: true,
    showTitle: true,
    showKind: false,
  },
  {
    kindCode: 'sentence',
    displayLabel: 'Sentence',
    segmentation: 'sentence',
    presentation: 'concatenated',
    showLabel: false,
    showTitle: false,
    showKind: false,
  },
];

export type OutlineKind = NonNullable<ContentOutline['kinds']>[number];

export function kindByCode(outline: ContentOutline | undefined, kindCode: string): OutlineKind | undefined {
  return outline?.kinds.find((kind) => kind.kindCode === kindCode);
}

export function effectiveDisplayKind(kind: OutlineKind | undefined): OutlineKind | undefined {
  if (!kind) return undefined;
  const runningText = asOutlinePresentation(kind.presentation) === 'concatenated';
  const placement = kind.labelPlacement ?? 'before_title';
  const showTitle = !runningText && kind.titlePolicy !== 'none' && kind.showTitle;
  const labelPlacement = placement === 'after_title' && !showTitle ||
    placement === 'inline' && !kind.mayHoldText ? 'before_title' : placement;
  const showLabel = kind.labelPolicy !== 'none' && kind.showLabel &&
    (!runningText || labelPlacement === 'inline' || labelPlacement === 'superscript');
  return { ...kind, showKind: !runningText && kind.showKind, showTitle, showLabel, labelPlacement };
}

export function nodeHeading(
  kind: OutlineKind | undefined,
  node: Pick<ContentNode, 'kind' | 'label' | 'number' | 'title'>,
): string | null {
  if (!kind) {
    const fallback = [node.kind, node.label ?? node.number, node.title].filter(Boolean).join(' ');
    return fallback || null;
  }
  kind = effectiveDisplayKind(kind);
  if (!kind) return null;
  const parts: string[] = [];
  if (kind.showKind) {
    parts.push(kind.displayLabel);
  }
  if (kind.showLabel && kind.labelPlacement !== 'inline' && kind.labelPlacement !== 'superscript') {
    const label = node.label ?? node.number;
    if (label) {
      parts.push(label);
    }
  }
  if (kind.showTitle && node.title) {
    parts.push(node.title);
  }
  if (kind.labelPlacement === 'after_title' && kind.showLabel && kind.showTitle && node.title) {
    return [kind.showKind ? kind.displayLabel : null, node.title, node.label ?? node.number].filter(Boolean).join(' ');
  }
  if (parts.length === 0) {
    return null;
  }
  if (kind.showTitle && node.title && parts.length > 1) {
    const title = parts.pop() as string;
    return `${parts.join(' ')} — ${title}`;
  }
  return parts.join(' ');
}

export function articleHeading(
  outline: ContentOutline | undefined,
  article: Pick<ArticleDetail, 'articleNumber' | 'title' | 'kind'>,
): string {
  const kind = kindByCode(outline, article.kind ?? outline?.kinds[0]?.kindCode ?? 'article');
  const heading = nodeHeading(kind, {
    kind: article.kind ?? 'article',
    label: article.articleNumber,
    number: article.articleNumber,
    title: article.title,
  });
  return heading ?? (kind ? '' : `Article ${article.articleNumber} — ${article.title}`);
}

export type RenderGroup =
  | { type: 'concatenated'; nodes: ContentNode[] }
  | { type: 'section'; node: ContentNode };

export function groupNodes(nodes: ContentNode[], outline?: ContentOutline): RenderGroup[] {
  const groups: RenderGroup[] = [];
  for (const node of nodes) {
    const kind = effectiveDisplayKind(kindByCode(outline, node.kind));
    const presentation = asOutlinePresentation(kind?.presentation);
    const last = groups[groups.length - 1];
    if (presentation === 'concatenated' && node.children.length === 0 && !kind?.showTitle && !kind?.showKind) {
      if (last && last.type === 'concatenated') {
        last.nodes.push(node);
      } else {
        groups.push({ type: 'concatenated', nodes: [node] });
      }
    } else {
      groups.push({ type: 'section', node });
    }
  }
  return groups;
}

export function concatenatedText(nodes: ContentNode[]): string {
  return nodes
    .map((node) => node.body?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
}

export type DepthStop = {
  label: string;
  throughKindIndex: number;
  includeText: boolean;
};

function isTitledSectionKind(kind: OutlineKind): boolean {
  return Boolean(effectiveDisplayKind(kind)?.showTitle);
}

export function depthStops(outline?: ContentOutline): DepthStop[] {
  const kinds = outline?.kinds ?? [];
  const stops: DepthStop[] = [{ label: 'Overview', throughKindIndex: 0, includeText: false }];
  kinds.forEach((kind, index) => {
    if (index === 0 || !isTitledSectionKind(kind)) {
      return;
    }
    stops.push({ label: kind.displayLabel, throughKindIndex: index, includeText: false });
  });
  stops.push({
    label: 'Full text',
    throughKindIndex: Math.max(0, kinds.length - 1),
    includeText: true,
  });
  return stops;
}

export function depthStopCount(outline?: ContentOutline): number {
  return depthStops(outline).length;
}

export function depthStopLabels(outline?: ContentOutline): string[] {
  return depthStops(outline).map((stop) => stop.label);
}

function stopAt(outline: ContentOutline | undefined, depth: number): DepthStop {
  const stops = depthStops(outline);
  const index = Math.min(Math.max(depth, 1), stops.length) - 1;
  return stops[index] ?? stops[0]!;
}

function nodeKindIndex(outline: ContentOutline | undefined, kindCode: string): number {
  const kinds = outline?.kinds ?? [];
  if (kinds.length === 0) {
    return 1;
  }
  const index = kinds.findIndex((kind) => kind.kindCode === kindCode);
  return index < 0 ? kinds.length - 1 : index;
}

export function clipNodes(
  nodes: ContentNode[],
  outline: ContentOutline | undefined,
  depth: number,
): ContentNode[] {
  return clipVisible(nodes, outline, stopAt(outline, depth));
}

function clipVisible(
  nodes: ContentNode[],
  outline: ContentOutline | undefined,
  stop: DepthStop,
): ContentNode[] {
  const clipped: ContentNode[] = [];
  for (const node of nodes) {
    const next = clipNode(node, outline, stop);
    if (next) {
      clipped.push(next);
    }
  }
  return clipped;
}

function clipNode(
  node: ContentNode,
  outline: ContentOutline | undefined,
  stop: DepthStop,
): ContentNode | null {
  if (!stop.includeText && nodeKindIndex(outline, node.kind) > stop.throughKindIndex) {
    return null;
  }
  const presentation = asOutlinePresentation(kindByCode(outline, node.kind)?.presentation);
  if (presentation === 'concatenated' && !stop.includeText) {
    return null;
  }
  return {
    ...node,
    body: stop.includeText ? node.body : null,
    children: clipVisible(node.children, outline, stop),
  };
}

/** Clip the ordered sequence without converting it into body plus children. */
export function clipOrderedEntries(entries: OrderedEntry[], outline: ContentOutline | undefined, depth: number): OrderedEntry[] {
  const stop = stopAt(outline, depth);
  function clip(content: OrderedEntry[]): OrderedEntry[] {
    return content.flatMap((entry): OrderedEntry[] => {
      if (entry.type === 'text') return stop.includeText ? [entry] : [];
      const node = entry.node;
      if (!node || (!stop.includeText && nodeKindIndex(outline, node.kind) > stop.throughKindIndex)) return [];
      if (!stop.includeText && asOutlinePresentation(kindByCode(outline, node.kind)?.presentation) === 'concatenated') return [];
      return [{ ...entry, node: { ...node, content: clip(node.content) } }];
    });
  }
  return clip(entries);
}
