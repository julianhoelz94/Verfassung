export const SEARCH_PAGE_SIZE = 20;

export type SearchUrlParams = {
  q?: string;
  country?: string;
  versionId?: string;
  effectiveDate?: string;
  offset?: number;
};

export function searchUrl(params: SearchUrlParams): string {
  const query = new URLSearchParams();
  const q = params.q?.trim();
  if (q) {
    query.set('q', q);
  }
  if (params.country) {
    query.set('country', params.country);
  }
  if (params.versionId) {
    query.set('versionId', params.versionId);
  }
  if (params.effectiveDate) {
    query.set('effectiveDate', params.effectiveDate);
  }
  if (params.offset && params.offset > 0) {
    query.set('offset', String(params.offset));
  }
  const encoded = query.toString();
  return encoded ? `/search?${encoded}` : '/search';
}

export function parseSearchOffset(raw?: string): number {
  const n = Number.parseInt(raw ?? '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
