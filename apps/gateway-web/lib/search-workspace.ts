import type { ArticleDetail, ContentOutline, SearchFacets, SearchHit } from './api';
import type { FootnoteItem } from './footnotes';
import { parseSearchOffset, searchUrl } from './search-url';

export type SearchCriteria = { country: string; jurisdictionId: string; versionId: string; effectiveDate: string };
export type SearchWorkspaceData = {
  query: string; requestHref: string; criteria: SearchCriteria; facets: SearchFacets; hits: SearchHit[];
  total: number; limit: number; offset: number; unavailable: boolean; facetsUnavailable: boolean; adjusted: boolean;
};
export type SearchPassage = {
  article: ArticleDetail; outline: ContentOutline | null; language: string;
  versionId: string; versionLabel: string; readerHref: string; notes: FootnoteItem[];
};
const allowedSearchKeys = new Set(['q', 'country', 'jurisdictionId', 'versionId', 'effectiveDate', 'offset']);
/** A reader return stays inside canonical Search, without workspace, command or external destinations. */
export function safeSearchHref(value: string | null | undefined): string | null {
  if (!value?.startsWith('/search') || value.length > 8192) return null;
  try {
    const url = new URL(value, 'https://atlas.invalid');
    if (url.origin !== 'https://atlas.invalid' || url.pathname !== '/search' || url.hash) return null;
    if ([...url.searchParams.keys()].some(key => !allowedSearchKeys.has(key) || url.searchParams.getAll(key).length !== 1)) return null;
    return searchUrl({ q: url.searchParams.get('q') ?? undefined, country: url.searchParams.get('country') ?? undefined,
      jurisdictionId: url.searchParams.get('jurisdictionId') ?? undefined, versionId: url.searchParams.get('versionId') ?? undefined,
      effectiveDate: url.searchParams.get('effectiveDate') ?? undefined, offset: parseSearchOffset(url.searchParams.get('offset') ?? undefined) });
  } catch { return null; }
}
export function searchHitKey(hit: Pick<SearchHit, 'versionId' | 'articleId'>): string {
  return hit.versionId + ':' + hit.articleId;
}
/** Preserve the existing country article route and jurisdiction occurrence fragment. */
export function searchHitHref(hit: Pick<SearchHit, 'countryCode' | 'jurisdictionId' | 'versionId' | 'articleId'>, returnTo?: string): string | undefined {
  const version = encodeURIComponent(hit.versionId), article = encodeURIComponent(hit.articleId);
  const base = hit.countryCode ? '/countries/' + encodeURIComponent(hit.countryCode) + '/versions/' + version + '/articles/' + article :
    hit.jurisdictionId ? '/jurisdictions/' + encodeURIComponent(hit.jurisdictionId) + '/versions/' + version + '#' + article : undefined;
  if (!base) return undefined;
  return readerSearchHref(base, returnTo);
}
export function readerSearchHref(base: string, returnTo?: string): string {
  const target = safeSearchHref(returnTo);
  if (!target) return base;
  const url = new URL(base, 'https://atlas.invalid'); url.searchParams.set('fromSearch', target);
  return url.pathname + url.search + url.hash;
}
export const emptySearchCriteria: SearchCriteria = { country: '', jurisdictionId: '', versionId: '', effectiveDate: '' };
