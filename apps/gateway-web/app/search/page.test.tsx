// READ-1/API-1: User Guide search, scoped snapshots and recoverable service failures.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import Search, { generateMetadata } from './page';
vi.mock('../../lib/server-locale', () => ({ currentLocale: async () => 'en' }));
vi.mock('../../lib/api', async original => ({ ...await original<typeof import('../../lib/api')>(), searchArticles: vi.fn(), searchFacets: vi.fn() }));
const props = (values: Record<string, string> = {}) => ({ searchParams: Promise.resolve(values) });
const hit: api.SearchHit = { articleId: 'unit-1', versionId: 'snapshot-1949', countryCode: 'XA', constitutionTitle: 'Republic Charter', versionLabel: '1949', effectiveDate: '1949-05-23', articleNumber: '1', title: 'Equal rights', snippet: 'Every citizen has equal rights.', rank: 1 };
beforeEach(() => {
  vi.mocked(api.searchFacets).mockResolvedValue({ countries: [{ code: 'XA', countryName: 'Republic', count: 21 }], versions: [{ id: 'snapshot-1949', label: '1949', constitutionTitle: 'Republic Charter', countryCode: 'XA', count: 21 }], dates: [] });
  vi.mocked(api.searchArticles).mockResolvedValue({ hits: [hit], total: 21, limit: 20, offset: 0 });
});
afterEach(() => vi.clearAllMocks());
const html = async (values: Record<string, string> = {}) => renderToStaticMarkup(await Search(props(values)));
describe('search selection and results', () => {
  it('retains the authored query and selected snapshot in result permalinks', async () => {
    const output = await html({ q: '  equal rights  ', country: 'XA', versionId: 'snapshot-1949' });
    expect(api.searchArticles).toHaveBeenCalledWith('equal rights', expect.objectContaining({ country: 'XA', versionId: 'snapshot-1949', offset: 0, limit: 20 }));
    expect(output).toContain('/countries/XA/versions/snapshot-1949/articles/unit-1'); expect(output).toContain('Equal rights'); expect(output).toContain('Every citizen has equal rights.');
    expect(output).toContain('offset=20'); expect(output).toContain('q=equal+rights');
  });
  it('keeps pagination and filters together on later pages', async () => {
    vi.mocked(api.searchArticles).mockResolvedValue({ hits: [hit], total: 41, limit: 20, offset: 20 });
    const output = await html({ q: 'rights', country: 'XA', effectiveDate: '1949-05-23', offset: '20' });
    expect(api.searchArticles).toHaveBeenCalledWith('rights', expect.objectContaining({ offset: 20, effectiveDate: '1949-05-23' })); expect(output).toContain('offset=40'); expect(output).toContain('country=XA');
  });
  it('does not search until a nonempty query is supplied', async () => {
    await html({ q: '  ' }); expect(api.searchArticles).not.toHaveBeenCalled();
  });
  it('drops incompatible selection filters and resets pagination', async () => {
    await html({ q: 'rights', country: 'ZZ', versionId: 'snapshot-1949', offset: '40' });
    expect(api.searchArticles).toHaveBeenCalledWith('rights', expect.objectContaining({ country: 'ZZ', versionId: undefined, offset: 0 }));
  });
  it('preserves an exact pinned snapshot when facet discovery is unavailable', async () => {
    vi.mocked(api.searchFacets).mockRejectedValue(new Error('offline')); await html({ q: 'rights', country: 'XA', versionId: 'retired-snapshot', offset: '40' }); expect(api.searchArticles).toHaveBeenCalledWith('rights', expect.objectContaining({ country: 'XA', versionId: 'retired-snapshot', offset: 40 }));
  });
  it('keeps keyword search available if optional facets fail', async () => {
    vi.mocked(api.searchFacets).mockRejectedValue(new Error('offline')); expect(await html({ q: 'rights' })).toContain('Equal rights');
  });
  it('distinguishes search failure from a successful empty result', async () => {
    vi.mocked(api.searchArticles).mockRejectedValue(new Error('offline')); const output = await html({ q: 'rights' }); expect(output).toContain('role="alert"'); expect(output).not.toContain('Equal rights');
  });
  it('renders an honest empty result without invented passages', async () => {
    vi.mocked(api.searchArticles).mockResolvedValue({ hits: [], total: 0, limit: 20, offset: 0 }); const output = await html({ q: 'absent' }); expect(output).not.toContain('Equal rights'); expect(new DOMParser().parseFromString(output, 'text/html').querySelector('.search-hit')).toBeNull(); expect(output).toContain('No articles match');
  });
  it('uses query-specific metadata while retaining the canonical search page', async () => {
    const metadata = await generateMetadata(props({ q: ' rights ' })); expect(metadata.title).toContain('rights'); expect(metadata.alternates?.canonical).toContain('/search');
  });
});
