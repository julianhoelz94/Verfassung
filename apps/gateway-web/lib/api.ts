export type VersionSummary = {
  id: string;
  versionLabel: string;
  effectiveDate: string | null;
  languageCode: string;
  sourceUrl: string | null;
  gazetteReference: string | null;
};

export type ConstitutionSummary = {
  id: string;
  slug: string;
  title: string;
  versions: VersionSummary[];
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
};

export type ArticleDetail = {
  id: string;
  versionId: string;
  articleNumber: string;
  title: string;
  body: string;
  sortOrder: number;
};

export type AmendmentChange = {
  id: string;
  articleId: string | null;
  articleNumber: string | null;
  changeType: string;
  note: string | null;
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

export function listCountries(): Promise<CountrySummary[] | null> {
  return readJson<CountrySummary[]>(`${catalogBaseUrl()}/countries`, 'catalog');
}

export function getCountry(isoCode: string): Promise<CountryDetail | null> {
  return readJson<CountryDetail>(
    `${catalogBaseUrl()}/countries/${encodeURIComponent(isoCode)}`,
    'catalog',
  );
}

export function listArticles(versionId: string): Promise<ArticleSummary[] | null> {
  return readJson<ArticleSummary[]>(
    `${contentBaseUrl()}/versions/${encodeURIComponent(versionId)}/articles`,
    'content',
  );
}

export function getArticle(articleId: string): Promise<ArticleDetail | null> {
  return readJson<ArticleDetail>(
    `${contentBaseUrl()}/articles/${encodeURIComponent(articleId)}`,
    'content',
  );
}

export function listAmendments(versionId: string): Promise<Amendment[] | null> {
  return readJson<Amendment[]>(
    `${amendmentBaseUrl()}/versions/${encodeURIComponent(versionId)}/amendments`,
    'amendment',
  );
}
