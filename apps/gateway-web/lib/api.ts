import './contracts';

export type VersionSummary = {
  id: string;
  versionLabel: string;
  effectiveDate: string | null;
  languageCode: string;
  sourceUrl: string | null;
  gazetteReference: string | null;
  provenance: string;
  verificationState: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
  predecessorVersionId?: string | null;
  legalVersionId?: string | null;
  currentVersionId?: string | null;
  hopKind?: string;
  listing?: string;
  latestPublished: boolean;
  publicationComment?: string | null;
};

export type VersionDetail = Pick<VersionSummary, 'id' | 'versionLabel' | 'effectiveDate' | 'languageCode' | 'predecessorVersionId' | 'legalVersionId' | 'currentVersionId' | 'hopKind' | 'listing'> & {
  constitutionId: string;
  publicationStatus: string;
  countryCode?: string | null;
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
  content?: OrderedEntry[];
  logicalId?: string;
  revisionId?: string;
  legacyIdentity?: boolean;
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
  content?: OrderedEntry[];
  logicalId?: string;
  revisionId?: string;
  legacyIdentity?: boolean;
};

export type ContentOutline = {
  kinds: {
    kindCode: string;
    displayLabel: string;
    sortOrder: number;
    mayHoldText: boolean;
    mayHoldChildren: boolean;
    allowedChildKinds: string[];
    presentation: string;
    showLabel: boolean;
    showTitle: boolean;
    showKind: boolean;
    allowTextAlongsideChildren?: boolean;
    titlePolicy?: string;
    labelPolicy?: string;
    labelPlacement?: string;
    segmentation?: string;
  }[];
};

export type ConstitutionSummary = {
  id: string;
  slug: string;
  title: string;
  latestVersionId?: string | null;
  versions: VersionSummary[];
  contentOutline?: ContentOutline;
  predecessorConstitutionId?: string | null;
  interim?: boolean;
  lifecycleStatus?: string;
};

export type ConstitutionLifecycleEvent = {
  id: string;
  constitutionId: string;
  eventType: 'adopted' | 'commenced' | 'suspended' | 'restored' | 'repealed';
  eventDate: string;
  sourceUrl: string | null;
  note: string | null;
  dateCertainty: 'exact' | 'approximate';
};

export type ProvisionLifecycleEvent = {
  id: string;
  constitutionId: string;
  sourceVersionId: string;
  eventType: 'deferred' | 'commenced' | 'suspended' | 'restored';
  eventDate: string;
  logicalUnitIds: string[];
  sourceUrl: string | null;
  note: string | null;
};

export type ResolvedUnit = {
  logicalId: string;
  pathLabels: string[];
  deepLink: string;
};

export type ExportedUnit = {
  logicalId?: string | null;
  kind?: string | null;
  label?: string | null;
  title?: string | null;
  content?: Array<{ type: string; node?: ExportedUnit | null }>;
};

export type WikiImage = {
  documentId: string;
  revision: number;
  alt: string;
  caption?: string | null;
  credit?: string | null;
  sourceUrl?: string | null;
  rights?: string | null;
  placement?: 'before_body' | 'after_body';
};

export type WikiPageRevision = {
  id: string;
  targetType: 'country' | 'constitution';
  targetId: string;
  predecessorId: string | null;
  summary: string;
  body: string;
  images: WikiImage[];
  sourceUrls: string[];
  createdAt?: string | null;
  createdBy?: string | null;
  publishedAt?: string | null;
};

export type CountrySummary = {
  id: string;
  isoCode: string;
  name: string;
  latestVersionLabel: string | null;
  latestEffectiveDate: string | null;
  latestVersionId?: string | null;
  versionCount: number;
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
  kind?: string;
  body?: string | null;
  children?: ContentNode[];
  content?: OrderedEntry[];
  logicalId?: string;
  revisionId?: string;
  legacyIdentity?: boolean;
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
  amendingLawTitle?: string | null;
  amendingLawCitation?: string | null;
  beforeRef?: AmendmentUnitRef | null;
  afterRef?: AmendmentUnitRef | null;
  linkReviewReason?: string | null;
  legacyLinkUnresolved?: boolean;
  pendingAfterLogicalId?: string | null;
};

export type AmendmentUnitRef = {
  versionId?: string | null;
  logicalId?: string | null;
  occurrenceId?: string | null;
  rootOccurrenceId?: string | null;
  revisionId?: string | null;
  unitKind?: 'node' | 'text_entry' | null;
  articleNumber?: string | null;
  constitutionId?: string | null;
  kind?: string | null;
  label?: string | null;
  breadcrumbs?: string[];
  text?: string | null;
  deepLink?: string | null;
};

export type Amendment = {
  id: string;
  title: string;
  summary: string;
  comment?: string | null;
  documents?: AmendmentDocument[];
  enactedOn: string | null;
  sourceReference: string | null;
  sourceVersionId?: string | null;
  targetVersionId?: string | null;
  constitutionId?: string;
  kind?: string;
  status?: string;
  reviewStatus?: string | null;
  publishedRevisionId?: string | null;
  effectiveOn?: string | null;
  changes: AmendmentChange[];
};

export type AmendmentDocument = {
  url?: string | null;
  fileId?: string | null;
  label?: string | null;
};

export class ApiUnavailableError extends Error {
  constructor(service: string) {
    super(`${service} is unavailable`);
    this.name = 'ApiUnavailableError';
  }
}

export async function readJson<T>(url: string, service: string, authorization?: string): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      headers: authorization ? { Authorization: authorization } : undefined,
    });
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

export function ingestionBaseUrl(): string {
  return process.env.INGESTION_API_URL ?? 'http://localhost/api/ingestion';
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

export type SearchPage = {
  hits: SearchHit[];
  total: number;
  limit: number;
  offset: number;
};

export type SearchFilters = {
  country?: string;
  versionId?: string;
  effectiveDate?: string;
  limit?: number;
  offset?: number;
};

export type CountryFacet = {
  code: string;
  countryName: string;
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

export function searchArticles(query: string, filters: SearchFilters = {}): Promise<SearchPage | null> {
  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;
  if (!query.trim()) {
    return Promise.resolve({ hits: [], total: 0, limit, offset });
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
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  return readJson<SearchPage>(`${searchBaseUrl()}/search?${params.toString()}`, 'search');
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

export function getConstitutionLifecycle(isoCode: string): Promise<ConstitutionLifecycleEvent[] | null> {
  return readJson<ConstitutionLifecycleEvent[]>(
    `${catalogBaseUrl()}/countries/${encodeURIComponent(isoCode)}/constitution-lifecycle`,
    'catalog',
  );
}

export function appendConstitutionLifecycle(
  constitutionId: string,
  payload: { eventType: ConstitutionLifecycleEvent['eventType']; eventDate: string; dateCertainty?: ConstitutionLifecycleEvent['dateCertainty']; sourceUrl?: string; note?: string },
  authorization: string,
): Promise<ConstitutionLifecycleEvent> {
  return sendJson<ConstitutionLifecycleEvent>(
    `${catalogBaseUrl()}/constitutions/${encodeURIComponent(constitutionId)}/lifecycle-events`,
    'catalog',
    'POST',
    payload,
    authorization,
  );
}

export function getProvisionLifecycle(isoCode: string): Promise<ProvisionLifecycleEvent[] | null> {
  return readJson<ProvisionLifecycleEvent[]>(
    `${catalogBaseUrl()}/countries/${encodeURIComponent(isoCode)}/provision-lifecycle`,
    'catalog',
  );
}

export function resolveUnit(versionId: string, logicalId: string): Promise<ResolvedUnit | null> {
  return readJson<ResolvedUnit>(
    `${contentBaseUrl()}/versions/${encodeURIComponent(versionId)}/resolve?logicalId=${encodeURIComponent(logicalId)}`,
    'content',
  );
}

export function getExportedUnits(versionId: string): Promise<{ roots: ExportedUnit[] } | null> {
  return readJson<{ roots: ExportedUnit[] }>(
    `${contentBaseUrl()}/versions/${encodeURIComponent(versionId)}/export`,
    'content',
  );
}

export function appendProvisionLifecycle(
  constitutionId: string,
  payload: {
    sourceVersionId: string;
    eventType: ProvisionLifecycleEvent['eventType'];
    eventDate: string;
    logicalUnitIds: string[];
    sourceUrl?: string;
    note?: string;
  },
  authorization: string,
): Promise<ProvisionLifecycleEvent> {
  return sendJson<ProvisionLifecycleEvent>(
    `${catalogBaseUrl()}/constitutions/${encodeURIComponent(constitutionId)}/provision-events`,
    'catalog',
    'POST',
    payload,
    authorization,
  );
}

export function getWikiPage(targetType: 'country' | 'constitution', targetId: string): Promise<WikiPageRevision | null> {
  return readJson<WikiPageRevision>(`${catalogBaseUrl()}/wiki/${targetType}/${encodeURIComponent(targetId)}`, 'catalog');
}

export function getWikiDraft(targetType: 'country' | 'constitution', targetId: string, authorization: string): Promise<WikiPageRevision | null> {
  return readJson<WikiPageRevision>(`${catalogBaseUrl()}/wiki/${targetType}/${encodeURIComponent(targetId)}/draft`, 'catalog', authorization);
}

export async function getWikiHistory(targetType: 'country' | 'constitution', targetId: string, authorization: string, page = 0): Promise<WikiPageRevision[]> {
  return (await readJson<WikiPageRevision[]>(`${catalogBaseUrl()}/wiki/${targetType}/${encodeURIComponent(targetId)}/history?limit=26&offset=${page * 25}`, 'catalog', authorization)) ?? [];
}

export function saveWikiDraft(targetType: 'country' | 'constitution', targetId: string, payload: {
  expectedRevisionId: string | null;
  summary: string;
  body: string;
  images: WikiImage[];
  sourceUrls: string[];
}, authorization: string): Promise<WikiPageRevision> {
  return sendJson<WikiPageRevision>(`${catalogBaseUrl()}/wiki/${targetType}/${encodeURIComponent(targetId)}/draft`, 'catalog', 'PUT', payload, authorization);
}

export function publishWikiPage(targetType: 'country' | 'constitution', targetId: string, revisionId: string, authorization: string): Promise<WikiPageRevision> {
  return sendJson<WikiPageRevision>(`${catalogBaseUrl()}/wiki/${targetType}/${encodeURIComponent(targetId)}/publish`, 'catalog', 'POST', { revisionId }, authorization);
}

export async function loadCountriesWithDetails(): Promise<{
  countries: CountrySummary[];
  details: Array<CountryDetail | null>;
}> {
  let countries: CountrySummary[] = [];
  try {
    countries = (await listCountries()) ?? [];
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) {
      throw error;
    }
  }
  const details = await Promise.all(countries.map((country) => getCountry(country.isoCode).catch(() => null)));
  return { countries, details };
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

export function listArticlePage(versionId: string, offset?: number, limit?: number, includeBody?: boolean): Promise<ArticlePage | null> {
  return listContentPage('articles', versionId, offset, limit, includeBody);
}

export function listUnitPage(versionId: string, offset?: number, limit?: number, includeBody?: boolean): Promise<ArticlePage | null> {
  return listContentPage('units', versionId, offset, limit, includeBody);
}

async function listContentPage(resource: 'articles' | 'units', versionId: string, offset?: number, limit?: number, includeBody?: boolean): Promise<ArticlePage | null> {
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
  const url = `${contentBaseUrl()}/versions/${encodeURIComponent(versionId)}/${resource}${query ? `?${query}` : ''}`;
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

const ARTICLE_PAGE_SIZE = 200;

export function listAllArticles(versionId: string, includeBody?: boolean): Promise<ArticleSummary[]> {
  return listAllContent('articles', versionId, includeBody);
}

export function listAllUnits(versionId: string, includeBody?: boolean): Promise<ArticleSummary[]> {
  return listAllContent('units', versionId, includeBody);
}

async function listAllContent(resource: 'articles' | 'units', versionId: string, includeBody?: boolean): Promise<ArticleSummary[]> {
  const all: ArticleSummary[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  while (offset < total) {
    const page = await listContentPage(resource, versionId, offset, ARTICLE_PAGE_SIZE, includeBody);
    if (!page) return all;
    all.push(...page.items);
    total = page.total;
    if (page.items.length === 0) break;
    offset += ARTICLE_PAGE_SIZE;
  }
  return all;
}

export function getArticle(articleId: string): Promise<ArticleDetail | null> {
  return readJson<ArticleDetail>(
    `${contentBaseUrl()}/articles/${encodeURIComponent(articleId)}`,
    'content',
  );
}

export function getUnit(versionId: string, unitId: string): Promise<ArticleDetail | null> {
  return readJson<ArticleDetail>(`${contentBaseUrl()}/versions/${encodeURIComponent(versionId)}/units/${encodeURIComponent(unitId)}`, 'content');
}

export function patchContentNode(
  nodeId: string,
  title: string,
  authorization?: string,
): Promise<ContentNode> {
  return sendJson<ContentNode>(
    `${contentBaseUrl()}/nodes/${encodeURIComponent(nodeId)}`,
    'content',
    'PATCH',
    { title },
    authorization,
  );
}

export type OutlineKindWrite = {
  kindCode: string;
  displayLabel: string;
  presentation: 'section' | 'concatenated';
  showLabel: boolean;
  showTitle: boolean;
  showKind: boolean;
  allowTextAlongsideChildren?: boolean;
  titlePolicy?: 'none' | 'optional' | 'required';
  labelPolicy?: 'none' | 'optional' | 'required';
  labelPlacement?: 'before_title' | 'after_title' | 'inline' | 'superscript';
  segmentation?: 'plain' | 'sentence';
};

export type OutlineUpdateResult = {
  outline: ContentOutline;
  versionIds: string[];
};

export async function sendJson<T>(
  url: string,
  service: string,
  method: string,
  body: unknown,
  authorization?: string,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authorization) {
    headers.Authorization = authorization;
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      cache: 'no-store',
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiUnavailableError(service);
  }
  if (!response.ok) {
    throw new ApiUnavailableError(service);
  }
  return (await response.json()) as T;
}

export function putContentOutline(
  constitutionId: string,
  kinds: OutlineKindWrite[],
  authorization?: string,
): Promise<OutlineUpdateResult> {
  return sendJson<OutlineUpdateResult>(
    `${catalogBaseUrl()}/constitutions/${encodeURIComponent(constitutionId)}/content-outline`,
    'catalog',
    'PUT',
    { kinds },
    authorization,
  );
}

export async function restructureVersion(
  versionId: string,
  keepKinds: string[],
  authorization?: string,
): Promise<void> {
  await sendJson<{ absorbed: number }>(
    `${contentBaseUrl()}/versions/${encodeURIComponent(versionId)}/restructure`,
    'content',
    'POST',
    { keepKinds },
    authorization,
  );
}

export async function createCountry(
  isoCode: string,
  name: string,
  authorization?: string,
): Promise<CountrySummary> {
  return sendJson<CountrySummary>(`${catalogBaseUrl()}/countries`, 'catalog', 'POST', {
    isoCode,
    name,
  }, authorization);
}

export async function ensureCountry(isoCode: string, name: string, authorization?: string): Promise<void> {
  const existing = await getCountry(isoCode);
  if (existing) {
    return;
  }
  await createCountry(isoCode, name, authorization);
}

export async function createConstitution(
  isoCode: string,
  slug: string,
  title: string,
  outline?: OutlineKindWrite[],
  authorization?: string,
  predecessorConstitutionId?: string | null,
  interim = false,
): Promise<ConstitutionSummary> {
  return sendJson<ConstitutionSummary>(
    `${catalogBaseUrl()}/countries/${encodeURIComponent(isoCode)}/constitutions`,
    'catalog',
    'POST',
    { slug, title, outline, predecessorConstitutionId, interim },
    authorization,
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

export function listAmendmentsByArticle(
  constitutionId: string,
  articleNumber: string,
): Promise<Amendment[] | null> {
  const params = new URLSearchParams({
    constitutionId,
    articleNumber,
  });
  return readJson<Amendment[]>(`${amendmentBaseUrl()}/amendments?${params.toString()}`, 'amendment');
}

export function listConstitutionAmendments(
  constitutionId: string,
  options?: { status?: 'all'; reviewStatus?: 'needs_review' | 'ok'; authorization?: string },
): Promise<Amendment[] | null> {
  const params = new URLSearchParams();
  if (options?.status) {
    params.set('status', options.status);
  }
  if (options?.reviewStatus) {
    params.set('reviewStatus', options.reviewStatus);
  }
  const query = params.toString();
  return readJson<Amendment[]>(
    `${amendmentBaseUrl()}/constitutions/${encodeURIComponent(constitutionId)}/amendments${query ? `?${query}` : ''}`,
    'amendment',
    options?.authorization,
  );
}

export function listConstitutionVersions(
  constitutionId: string,
  options?: { listing?: 'all'; authorization?: string },
): Promise<VersionSummary[] | null> {
  const params = new URLSearchParams();
  if (options?.listing) {
    params.set('listing', options.listing);
  }
  const query = params.toString();
  return readJson<VersionSummary[]>(
    `${catalogBaseUrl()}/constitutions/${encodeURIComponent(constitutionId)}/versions${query ? `?${query}` : ''}`,
    'catalog',
    options?.authorization,
  );
}

export function getVersion(versionId: string, authorization?: string): Promise<VersionDetail | null> {
  return readJson<VersionDetail>(
    `${catalogBaseUrl()}/versions/${encodeURIComponent(versionId)}`,
    'catalog',
    authorization,
  );
}

export type SettingsRevision = { id: string; predecessorId: string | null; outline: ContentOutline };
export type SettingsImpact = { currentRevisionId: string; classification: string; affectedVersionIds: string[]; reasons: string[]; affectedDraftSessionIds: string[]; violations: { versionId: string; logicalId: string | null; field: string; message: string }[] };
export async function getConstitutionSettings(id: string): Promise<SettingsRevision> {
  const settings = await readJson<SettingsRevision>(`${catalogBaseUrl()}/constitutions/${encodeURIComponent(id)}/settings`, 'catalog');
  if (!settings) throw new ApiUnavailableError('catalog');
  return settings;
}
export function preflightSettings(id: string, kinds: OutlineKindWrite[], authorization: string): Promise<SettingsImpact> {
  return sendJson<SettingsImpact>(`${catalogBaseUrl()}/constitutions/${encodeURIComponent(id)}/settings/preflight`, 'catalog', 'POST', { kinds }, authorization);
}
export function saveSettings(id: string, expectedRevisionId: string, kinds: OutlineKindWrite[], authorization: string): Promise<SettingsRevision> {
  return sendJson<SettingsRevision>(`${catalogBaseUrl()}/constitutions/${encodeURIComponent(id)}/settings`, 'catalog', 'PUT', { expectedRevisionId, kinds }, authorization);
}

export function getReaderOutline(versionId: string): Promise<ContentOutline | null> {
  return readJson<ContentOutline>(`${catalogBaseUrl()}/versions/${encodeURIComponent(versionId)}/reader-settings`, 'catalog');
}
export function restoreSettings(id: string, revisionId: string, expectedRevisionId: string, authorization: string): Promise<SettingsRevision> {
  return sendJson<SettingsRevision>(`${catalogBaseUrl()}/constitutions/${encodeURIComponent(id)}/settings/${encodeURIComponent(revisionId)}/restore`, 'catalog', 'POST', { expectedRevisionId }, authorization);
}

export type OrderedNode = { logicalId: string; revisionId: string; occurrenceId: string; kind: string; label: string | null; title: string | null; content: OrderedEntry[] };
export type OrderedEntry = { type: 'text' | 'child'; node?: OrderedNode | null; logicalId?: string | null; revisionId?: string | null; occurrenceId?: string | null; text?: string | null };

export function getVersionSettings(versionId: string): Promise<SettingsRevision | null> {
  return readJson<SettingsRevision>(`${catalogBaseUrl()}/versions/${encodeURIComponent(versionId)}/settings`, 'catalog');
}
