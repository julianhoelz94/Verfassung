import type { ArticleDetail, ArticleSummary, ContentNode, ContentOutline, OutlineKindWrite } from './api';

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
}): OutlineKindWrite {
  const presentation = asOutlinePresentation(kind.presentation);
  const concatenated = presentation === 'concatenated';
  return {
    kindCode: kind.kindCode,
    displayLabel: kind.displayLabel,
    presentation,
    showLabel: concatenated ? false : Boolean(kind.showLabel),
    showTitle: concatenated ? false : Boolean(kind.showTitle),
    showKind: concatenated ? false : Boolean(kind.showKind),
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

export function nodeHeading(
  kind: OutlineKind | undefined,
  node: Pick<ContentNode, 'kind' | 'label' | 'number' | 'title'>,
): string | null {
  if (!kind) {
    const fallback = [node.kind, node.label ?? node.number, node.title].filter(Boolean).join(' ');
    return fallback || null;
  }
  const parts: string[] = [];
  if (kind.showKind) {
    parts.push(kind.displayLabel);
  }
  if (kind.showLabel) {
    const label = node.label ?? node.number;
    if (label) {
      parts.push(label);
    }
  }
  if (kind.showTitle && node.title) {
    parts.push(node.title);
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
  return heading ?? `Article ${article.articleNumber} — ${article.title}`;
}

export type RenderGroup =
  | { type: 'concatenated'; nodes: ContentNode[] }
  | { type: 'section'; node: ContentNode };

export function groupNodes(nodes: ContentNode[], outline?: ContentOutline): RenderGroup[] {
  const groups: RenderGroup[] = [];
  for (const node of nodes) {
    const presentation = asOutlinePresentation(kindByCode(outline, node.kind)?.presentation);
    const last = groups[groups.length - 1];
    if (presentation === 'concatenated') {
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
  return asOutlinePresentation(kind.presentation) !== 'concatenated' && Boolean(kind.showTitle);
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
