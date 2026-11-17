import { searchArticles, searchFacets, type SearchFacets } from '../../lib/api';
import { normalizeSearchSelection } from '../../lib/search-filters';
import { SEARCH_PAGE_SIZE, parseSearchOffset, searchUrl } from '../../lib/search-url';
import type { SearchWorkspaceData } from '../../lib/search-workspace';

export type SearchParams = { q?: string; country?: string; jurisdictionId?: string; versionId?: string; effectiveDate?: string; offset?: string };
/** Keep optional facets independent of required results; unknown pinned selections remain exact. */
export async function loadSearchWorkspace(params: SearchParams): Promise<SearchWorkspaceData> {
  let facets: SearchFacets = { countries: [], versions: [], dates: [] }, facetsUnavailable = false;
  try { const result = await searchFacets(); if (result) facets = result; } catch { facetsUnavailable = true; }
  const requested = { country: params.country?.trim() ?? '', jurisdictionId: params.jurisdictionId?.trim() ?? '', versionId: params.versionId?.trim() ?? '' };
  const selection = normalizeSearchSelection(facets, requested);
  const adjusted = Object.keys(requested).some(key => requested[key as keyof typeof requested] !== selection[key as keyof typeof selection]);
  const data: SearchWorkspaceData = {
    query: params.q?.trim() ?? '', criteria: { ...selection, effectiveDate: params.effectiveDate?.trim() ?? '' }, facets,
    requestHref: searchUrl({ ...params, offset: parseSearchOffset(params.offset) }),
    offset: adjusted ? 0 : parseSearchOffset(params.offset), limit: SEARCH_PAGE_SIZE, total: 0, hits: [],
    unavailable: false, facetsUnavailable, adjusted,
  };
  if (!data.query) return data;
  try {
    const page = await searchArticles(data.query, { country: selection.country || undefined, jurisdictionId: selection.jurisdictionId || undefined,
      versionId: selection.versionId || undefined, effectiveDate: data.criteria.effectiveDate || undefined, offset: data.offset, limit: SEARCH_PAGE_SIZE });
    if (page) { data.hits = page.hits; data.total = page.total; data.limit = page.limit; }
  } catch { data.unavailable = true; }
  return data;
}
