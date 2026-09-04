import './contracts';

export type VersionSummary = {
  id: string;
  versionLabel: string;
  effectiveDate: string | null;
  languageCode: string;
  sourceUrl: string | null;
  gazetteReference: string | null;
};

export type ContentNode = {
  id: string;
  kind: string;
  label: string | null;
  number: string | null;
  title: string | null;
  body: string | null;
  sortOrder: number;
  children: ContentNode[];
};

export type ArticleDetail = {
  id: string;
  versionId: string;
  articleNumber: string;
  title: string;
  body: string;
  sortOrder: number;
  kind?: string;
  children?: ContentNode[];
};

export type ContentOutline = {
  kinds: {
    kindCode: string;
    displayLabel: string;
    sortOrder: number;
    mayHoldText: boolean;
    mayHoldChildren: boolean;
    allowedChildKinds: string[];
  }[];
};

export type ConstitutionSummary = {
  id: string;
  slug: string;
  title: string;
  versions: VersionSummary[];
  contentOutline?: ContentOutline;
};

export type CountrySummary = {
  id: string;
  isoCode: string;
  name: string;
};

export type CountryDetail = {
  id: string;
  isoCode: string;
  name: string;
  constitutions: ConstitutionSummary[];
};

export type ArticleSummary = {
  id: string;
  versionId: string;
  articleNumber: string;
  title: string;
  sortOrder: number;
  body?: string | null;
};

export type AmendmentChange = {
  id: string;
  articleId: string | null;
  articleNumber: string | null;
  changeType: string;
  note: string | null;
  nodeId?: string | null;
  changedOn?: string | null;
  effectiveOn?: string | null;
  amendingLawCitationId?: string | null;
};

export type Amendment = {
  id: string;
  title: string;
  summary: string;
  enactedOn: string | null;
  sourceReference: string | null;
  sourceVersionId: string;
  targetVersionId: string;
  changes: AmendmentChange[];
};

export class ApiUnavailableError extends Error {
  constructor(service: string) {
    super(`${service} is unavailable`);
    this.name = 'ApiUnavailableError';
  }
}

async function readJson<T>(url: string, service: string): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new ApiUnavailableError(service);
  }
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new ApiUnavailableError(service);
  }
  return (await response.json()) as T;
}

export function catalogBaseUrl(): string {
  return process.env.CATALOG_API_URL ?? 'http://localhost/api/catalog';
}

export function contentBaseUrl(): string {
  return process.env.CONTENT_API_URL ?? 'http://localhost/api/content';
}

export function amendmentBaseUrl(): string {
  return process.env.AMENDMENT_API_URL ?? 'http://localhost/api/amendment';
}

export function searchBaseUrl(): string {
  return process.env.SEARCH_API_URL ?? 'http://localhost/api/search';
}

export type SearchHit = {
  articleId: string;
  versionId: string;
  countryCode: string;
  constitutionTitle: string;
  versionLabel: string;
  effectiveDate: string | null;
  articleNumber: string;
  title: string;
  snippet: string;
  rank: number;
};

export type SearchFilters = {
  country?: string;
  versionId?: string;
  effectiveDate?: string;
};

export type CountryFacet = {
  code: string;
  count: number;
};

export type VersionFacet = {
  id: string;
  label: string;
  constitutionTitle: string;
  countryCode: string;
  count: number;
};

export type DateFacet = {
  effectiveDate: string;
  count: number;
};

export type SearchFacets = {
  countries: CountryFacet[];
  versions: VersionFacet[];
  dates: DateFacet[];
};

export function searchArticles(query: string, filters: SearchFilters = {}): Promise<SearchHit[] | null> {
  if (!query.trim()) {
    return Promise.resolve([]);
  }
  const params = new URLSearchParams();
  params.set('q', query);
  if (filters.country) {
    params.set('country', filters.country);
  }
  if (filters.versionId) {
    params.set('versionId', filters.versionId);
  }
  if (filters.effectiveDate) {
    params.set('effectiveDate', filters.effectiveDate);
  }
  return readJson<SearchHit[]>(`${searchBaseUrl()}/search?${params.toString()}`, 'search');
}

export function searchFacets(): Promise<SearchFacets | null> {
  return readJson<SearchFacets>(`${searchBaseUrl()}/search/facets`, 'search');
}

export function listCountries(): Promise<CountrySummary[] | null> {
  return readJson<CountrySummary[]>(`${catalogBaseUrl()}/countries`, 'catalog');
}

export function getCountry(isoCode: string): Promise<CountryDetail | null> {
  return readJson<CountryDetail>(
    `${catalogBaseUrl()}/countries/${encodeURIComponent(isoCode)}`,
    'catalog',
  );
}

export type ArticlePage = {
  items: ArticleSummary[];
  total: number;
  offset: number;
  limit: number | null;
};

export async function listArticles(
  versionId: string,
  offset?: number,
  limit?: number,
): Promise<ArticleSummary[] | null> {
  const page = await listArticlePage(versionId, offset, limit);
  return page?.items ?? null;
}

export async function listArticlePage(
  versionId: string,
  offset?: number,
  limit?: number,
  includeBody?: boolean,
): Promise<ArticlePage | null> {
  const params = new URLSearchParams();
  if (offset !== undefined) {
    params.set('offset', String(offset));
  }
  if (limit !== undefined) {
    params.set('limit', String(limit));
  }
  if (includeBody) {
    params.set('includeBody', 'true');
  }
  const query = params.toString();
  const url = `${contentBaseUrl()}/versions/${encodeURIComponent(versionId)}/articles${query ? `?${query}` : ''}`;
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new ApiUnavailableError('content');
  }
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new ApiUnavailableError('content');
  }
  const items = (await response.json()) as ArticleSummary[];
  const total = Number(response.headers.get('X-Total-Count') ?? items.length);
  return { items, total, offset: offset ?? 0, limit: limit ?? null };
}

export function getArticle(articleId: string): Promise<ArticleDetail | null> {
  return readJson<ArticleDetail>(
    `${contentBaseUrl()}/articles/${encodeURIComponent(articleId)}`,
    'content',
  );
}

export function listAmendments(
  versionId: string,
  sourceVersionId?: string,
): Promise<Amendment[] | null> {
  const params = new URLSearchParams();
  if (sourceVersionId) {
    params.set('sourceVersionId', sourceVersionId);
  }
  const query = params.toString();
  return readJson<Amendment[]>(
    `${amendmentBaseUrl()}/versions/${encodeURIComponent(versionId)}/amendments${query ? `?${query}` : ''}`,
    'amendment',
  );
}
