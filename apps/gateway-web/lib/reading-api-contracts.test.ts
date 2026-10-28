// API-1: explicit Catalog/Content/Amendment/Search HTTP contracts.
// HTTP is the external boundary: expected routes/filters are literals, never derived from the client.
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import { json } from '../test/server-boundary';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const bearer = 'Bearer staff-session';

describe('public and staff read contracts', () => {
  const contracts: { name: string; run: () => Promise<unknown>; path: string; authorization?: string; response: unknown }[] = [
    { name: 'country identity', run: () => api.getCountry('X/A', bearer), path: '/api/catalog/countries/X%2FA', authorization: bearer, response: { id: 'country', isoCode: 'XA', name: 'Republic', constitutions: [] } },
    { name: 'published versions', run: () => api.listConstitutionVersions('charter/id'), path: '/api/catalog/constitutions/charter%2Fid/versions', response: [] },
    { name: 'staff snapshots', run: () => api.listConstitutionVersions('charter', { listing: 'all', authorization: bearer }), path: '/api/catalog/constitutions/charter/versions?listing=all', authorization: bearer, response: [{ id: 'correction', listing: 'staff', hopKind: 'editorial_correction' }] },
    { name: 'snapshot identity', run: () => api.getVersion('snapshot/id', bearer), path: '/api/catalog/versions/snapshot%2Fid', authorization: bearer, response: { id: 'snapshot/id', constitutionId: 'charter', publicationStatus: 'published' } },
    { name: 'article permalink', run: () => api.getArticle('article/id', bearer), path: '/api/content/articles/article%2Fid', authorization: bearer, response: { id: 'article/id', body: 'Authored guarantee.' } },
    { name: 'version-bound unit', run: () => api.getUnit('snapshot/id', 'unit/id', bearer), path: '/api/content/versions/snapshot%2Fid/units/unit%2Fid', authorization: bearer, response: { id: 'unit/id', versionId: 'snapshot/id', body: 'Historical text.' } },
    { name: 'logical identity resolution', run: () => api.resolveUnit('snapshot/id', 'logical/id'), path: '/api/content/versions/snapshot%2Fid/resolve?logicalId=logical%2Fid', response: { logicalId: 'logical/id', pathLabels: ['Article 1'], deepLink: '/versions/snapshot/id#unit' } },
    { name: 'ordered export', run: () => api.getExportedUnits('snapshot/id'), path: '/api/content/versions/snapshot%2Fid/export', response: { roots: [] } },
    { name: 'constitution lifecycle', run: () => api.getConstitutionLifecycle('X/A'), path: '/api/catalog/countries/X%2FA/constitution-lifecycle', response: [] },
    { name: 'provision lifecycle', run: () => api.getProvisionLifecycle('X/A'), path: '/api/catalog/countries/X%2FA/provision-lifecycle', response: [] },
    { name: 'version change records', run: () => api.listAmendments('snapshot/id', 'old&id'), path: '/api/amendment/versions/snapshot%2Fid/amendments?sourceVersionId=old%26id', response: [] },
    { name: 'article history', run: () => api.listAmendmentsByArticle('charter&id', '46a bis'), path: '/api/amendment/amendments?constitutionId=charter%26id&articleNumber=46a+bis', response: [] },
    { name: 'staff quote-review queue', run: () => api.listConstitutionAmendments('charter/id', { status: 'all', reviewStatus: 'needs_review', authorization: bearer }), path: '/api/amendment/constitutions/charter%2Fid/amendments?status=all&reviewStatus=needs_review', authorization: bearer, response: [] },
    { name: 'published context', run: () => api.getWikiPage('country', 'country/id'), path: '/api/catalog/wiki/country/country%2Fid', response: { id: 'published-r2', summary: 'Published context' } },
    { name: 'private contextual draft', run: () => api.getWikiDraft('constitution', 'charter/id', bearer), path: '/api/catalog/wiki/constitution/charter%2Fid/draft', authorization: bearer, response: { id: 'draft-r3', summary: 'Unpublished correction' } },
    { name: 'context history pagination', run: () => api.getWikiHistory('country', 'country/id', bearer, 2), path: '/api/catalog/wiki/country/country%2Fid/history?limit=26&offset=50', authorization: bearer, response: [] },
    { name: 'published structural settings', run: () => api.getVersionSettings('snapshot/id', bearer), path: '/api/catalog/versions/snapshot%2Fid/settings', authorization: bearer, response: { id: 'settings-r1', outline: { kinds: [] } } },
    { name: 'current constitution settings', run: () => api.getConstitutionSettings('charter/id', bearer), path: '/api/catalog/constitutions/charter%2Fid/settings', authorization: bearer, response: { id: 'settings-r3', outline: { kinds: [] } } },
    { name: 'search facets', run: () => api.searchFacets(), path: '/api/search/search/facets', response: { countries: [], versions: [], dates: [] } },
  ];
  for (const contract of contracts) it(`preserves the ${contract.name} contract`, async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(contract.response));
    expect(await contract.run()).toEqual(contract.response);
    const [input, options] = upstream.mock.calls[0]; const url = new URL(String(input));
    expect(url.pathname + url.search).toBe(contract.path); expect(options?.cache).toBe('no-store'); expect(new Headers(options?.headers).get('Authorization')).toBe(contract.authorization ?? null); expect(options?.method ?? 'GET').toBe('GET');
  });

  it('preserves search values without letting them become additional query parameters', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ hits: [], total: 0, offset: 20, limit: 10 }));
    await api.searchArticles('rights & dignity', { country: 'XA', jurisdictionId: 'region/id', versionId: 'snapshot&id', effectiveDate: '1949-05-23', limit: 10, offset: 20 });
    expect(Object.fromEntries(new URL(String(upstream.mock.calls[0][0])).searchParams)).toEqual({ q: 'rights & dignity', jurisdictionId: 'region/id', country: 'XA', versionId: 'snapshot&id', effectiveDate: '1949-05-23', limit: '10', offset: '20' });
  });
  it('does not send an empty search upstream', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch'); expect(await api.searchArticles('  ', { limit: 10, offset: 20 })).toEqual({ hits: [], total: 0, limit: 10, offset: 20 }); expect(upstream).not.toHaveBeenCalled();
  });
  it('uses configured service endpoints', async () => {
    vi.stubEnv('CATALOG_API_URL', 'http://catalog.internal'); vi.stubEnv('CONTENT_API_URL', 'http://content.internal'); vi.stubEnv('AMENDMENT_API_URL', 'http://amendment.internal'); vi.stubEnv('SEARCH_API_URL', 'http://search.internal'); vi.stubEnv('INGESTION_API_URL', 'http://ingestion.internal');
    expect([api.catalogBaseUrl(), api.contentBaseUrl(), api.amendmentBaseUrl(), api.searchBaseUrl(), api.ingestionBaseUrl()]).toEqual(['http://catalog.internal', 'http://content.internal', 'http://amendment.internal', 'http://search.internal', 'http://ingestion.internal']);
  });
  it.each([401, 403, 500])('keeps an HTTP %s read failure distinct from a missing resource', async status => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}, status)); await expect(api.getCountry('XA')).rejects.toBeInstanceOf(api.ApiUnavailableError);
  });
});

describe('complete content enumeration and write outcomes', () => {
  it.each(['articles', 'units'] as const)('loads every %s page with stable snapshot and authorization', async resource => {
    const first = Array.from({ length: 200 }, (_, i) => ({ id: `unit-${i}`, body: `Text ${i}` })); const last = [{ id: 'unit-200', body: 'Final guarantee' }];
    const upstream = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => { const offset = new URL(String(input)).searchParams.get('offset'); const response = json(offset === '0' ? first : last); response.headers.set('X-Total-Count', '201'); return response; });
    const output = resource === 'articles' ? await api.listAllArticles('snapshot/id', true, bearer) : await api.listAllUnits('snapshot/id', true, bearer);
    expect(output).toEqual([...first, ...last]); expect(upstream).toHaveBeenCalledTimes(2);
    expect(upstream.mock.calls.map(([input]) => new URL(String(input)).searchParams.get('offset'))).toEqual(['0', '200']);
    for (const [input, options] of upstream.mock.calls) { expect(new URL(String(input)).pathname).toBe(`/api/content/versions/snapshot%2Fid/${resource}`); expect(new Headers(options?.headers).get('Authorization')).toBe(bearer); expect(new URL(String(input)).searchParams.get('includeBody')).toBe('true'); }
  });
  it('does not claim a successful complete read when a later page is unavailable', async () => {
    const first = json(Array.from({ length: 200 }, (_, i) => ({ id: String(i) }))); first.headers.set('X-Total-Count', '201');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(first).mockResolvedValueOnce(json({}, 503)); await expect(api.listAllUnits('snapshot')).rejects.toBeInstanceOf(api.ApiUnavailableError);
  });
  it('creates a missing country once and never updates an existing country', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({}, 404)).mockResolvedValueOnce(json({ id: 'country' })).mockResolvedValueOnce(json({ id: 'country' }));
    await api.ensureCountry('XA', 'Republic', bearer); await api.ensureCountry('XA', 'Replacement name', bearer);
    expect(upstream.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1); expect(JSON.parse(String(upstream.mock.calls[1][1]?.body))).toEqual({ isoCode: 'XA', name: 'Republic' });
  });
  it('patches only the requested node title and never retries a rejected mutation', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}, 409)); await expect(api.patchContentNode('unit/id', 'Authored title', bearer)).rejects.toBeInstanceOf(api.ApiUnavailableError);
    expect(upstream).toHaveBeenCalledTimes(1); expect(upstream.mock.calls[0][1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ title: 'Authored title' }) });
  });
});
