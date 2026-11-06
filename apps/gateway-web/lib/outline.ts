import type { ArticleDetail, ContentNode, ContentOutline, OrderedEntry, OutlineKindWrite } from './api';

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
  sentenceDelimiters?: string[];
  root?: boolean;
  allowedChildKinds?: string[];
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
    sentenceDelimiters: kind.sentenceDelimiters ?? ['.', '!', '?'],
    ...(kind.root === undefined ? {} : { root: kind.root }),
    ...(kind.allowedChildKinds === undefined ? {} : { allowedChildKinds: kind.allowedChildKinds }),
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

export type HeadingPart = {
  part: "kind" | "label" | "title" | "separator";
  text: string;
};
/** One heading composition serves plain reader text and annotated setup previews. */
export function nodeHeadingParts(
  kind: OutlineKind | undefined,
  node: Pick<ContentNode, "kind" | "label" | "number" | "title">,
): HeadingPart[] {
  const effective = effectiveDisplayKind(kind),
    label = node.label ?? node.number;
  const name = !kind
    ? node.kind
    : effective?.showKind
      ? effective.displayLabel
      : null;
  const number =
    !kind ||
    (effective?.showLabel &&
      !["inline", "superscript"].includes(
        effective.labelPlacement ?? "before_title",
      ))
      ? label
      : null;
  const title = !kind || effective?.showTitle ? node.title : null;
  const values: HeadingPart[] = [];
  function append(
    part: HeadingPart["part"],
    text: string | null | undefined,
    separator = " ",
  ) {
    if (!text) return;
    if (values.length) values.push({ part: "separator", text: separator });
    values.push({ part, text });
  }
  append("kind", name);
  if (
    effective?.labelPlacement === "after_title" &&
    effective.showLabel &&
    title
  ) {
    append("title", title);
    append("label", label);
  } else {
    append("label", number);
    append("title", title, kind ? " — " : " ");
  }
  return values;
}

export function nodeHeading(
  kind: OutlineKind | undefined,
  node: Pick<ContentNode, 'kind' | 'label' | 'number' | 'title'>,
): string | null {
  return (
    nodeHeadingParts(kind, node)
      .map((part) => part.text).join("") || null
  );
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
