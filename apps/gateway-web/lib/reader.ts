import type { ArticleSummary, ContentOutline, VersionSummary } from './api';
import { alignArticles, netArticleKind, type CompareKind } from './compare';
import { orderedText } from './ordered-content';
import { diffText, type DiffSeg } from './text-diff';

export type ReaderPublication = Pick<VersionSummary, 'id' | 'versionLabel' | 'effectiveDate'> & { snapshotId: string };
export type ReaderChange = {
  key: string; kind: Exclude<CompareKind, 'same'>; label: string; fromRoot?: string; toRoot?: string;
  segments: DiffSeg[]; presentationOnly: boolean;
};

/** Pair logical identities, including renumbered units, before comparing their authored content. */
export function readerChanges(left: ArticleSummary[], right: ArticleSummary[]): ReaderChange[] {
  return alignArticles(left, right).flatMap(pair => {
    const kind = netArticleKind(pair.left, pair.right, []);
    if (kind === 'same') return [];
    const before = articleText(pair.left), after = articleText(pair.right);
    const unit = pair.right ?? pair.left!;
    return [{ key: pair.key, kind, label: [unit.articleNumber, unit.title].filter(Boolean).join(' · '),
      fromRoot: pair.left?.id, toRoot: pair.right?.id, segments: diffText(before, after),
      presentationOnly: before === after }];
  });
}

function articleText(article?: ArticleSummary): string {
  if (!article) return '';
  if (article.content != null) return orderedText(article.content);
  if (article.body) return article.body;
  function nodes(items: NonNullable<ArticleSummary['children']>): string {
    return items.map(node => [node.body, nodes(node.children)].filter(Boolean).join('\n')).join('\n');
  }
  return nodes(article.children ?? []);
}

export type ReaderPreferences = { size: '16' | '17' | '20'; presentation: 'source' | 'flowing' | 'lines'; boundaries: boolean; navigation: boolean };
export const defaultReaderPreferences: ReaderPreferences = { size: '17', presentation: 'source', boundaries: false, navigation: true };
export function readReaderPreferences(value: unknown): ReaderPreferences {
  const item = value && typeof value === 'object' ? value as Partial<ReaderPreferences> : {};
  return { size: ['16', '17', '20'].includes(item.size ?? '') ? item.size! : '17',
    presentation: ['source', 'flowing', 'lines'].includes(item.presentation ?? '') ? item.presentation! : 'source',
    boundaries: item.boundaries === true, navigation: item.navigation !== false };
}

/** Presentation changes never edit wording, node identity, labels, or source line breaks. */
export function readerPresentation(outline: ContentOutline | undefined, presentation: ReaderPreferences['presentation']): ContentOutline | undefined {
  if (!outline || presentation === 'source') return outline;
  return { kinds: outline.kinds.map(kind => kind.segmentation === 'sentence' && !kind.mayHoldChildren
    ? { ...kind, presentation: presentation === 'flowing' ? 'concatenated' : 'section' } : kind) };
}
