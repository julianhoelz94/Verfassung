// READ-1/2: ADR 0002/0005 and User Guide. Rendering executes actual page composition.
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/api';
import { currentUser } from '../lib/session';
import { requestAnonymousBrowsingPolicy } from '../lib/anonymous-browsing-policy';
import { listDocumentLinks } from '../lib/document-api';
import { article, countryFixture, correction, instrument, nextLaw, original } from '../test/reader-fixtures';
import Home from './page';
import Country, { generateMetadata as countryMetadata } from './countries/[code]/page';
import Version, { generateMetadata as versionMetadata } from './countries/[code]/versions/[versionId]/page';
import Compare, { generateMetadata as compareMetadata } from './countries/[code]/compare/page';
import Timeline from './countries/[code]/timeline/page';
import ArticleHistory from './countries/[code]/articles/[articleNumber]/page';
import ArticlePage, { generateMetadata as articleMetadata } from './countries/[code]/versions/[versionId]/articles/[articleId]/page';

vi.mock('../lib/api', async originalModule => ({ ...await originalModule<typeof import('../lib/api')>(), getCountry: vi.fn(), getWikiPage: vi.fn(), listCountries: vi.fn(), listArticlePage: vi.fn(), listConstitutionAmendments: vi.fn(), listAllUnits: vi.fn(), getVersion: vi.fn(), getReaderOutline: vi.fn(), listAmendments: vi.fn(), getConstitutionLifecycle: vi.fn(), getProvisionLifecycle: vi.fn(), resolveUnit: vi.fn(), listAllArticles: vi.fn(), listAmendmentsByArticle: vi.fn(), getUnit: vi.fn() }));
vi.mock('../lib/document-api', () => ({ listDocumentLinks: vi.fn() }));
vi.mock('../lib/session', () => ({ currentUser: vi.fn(), requireSessionBearer: async () => 'Bearer staff-session' }));
vi.mock('../lib/server-locale', () => ({ currentLocale: async () => 'en' }));
vi.mock('../lib/anonymous-browsing-policy', () => ({ requestAnonymousBrowsingPolicy: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found'); }, useRouter: () => ({ refresh: vi.fn() }) }));
// These async child boundaries have their own tests; React 18 static markup cannot await them.
vi.mock('./components/ContentTranslationRegion', () => ({ ContentTranslationRegion: ({ children }: { children: ReactNode }) => children }));
vi.mock('./components/VersionDocuments', () => ({ VersionDocuments: () => null }));
vi.mock('./components/AmendmentUnitLinks', () => ({ AmendmentUnitLinks: () => null }));
let country = countryFixture();
let mounted: Root | undefined;
async function expandedReader(id = 'law-1949') {
  const container = document.createElement('div'); mounted = createRoot(container);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  await act(async () => mounted!.render(await Version(versionProps(id))));
  return container;
}
const params = () => Promise.resolve({ code: 'XA' });
const versionProps = (id = original.id) => ({ params: Promise.resolve({ code: 'XA', versionId: id }), searchParams: Promise.resolve({}) });
const compareProps = (from = original.id, to = nextLaw.id, all?: string) => ({ params: params(), searchParams: Promise.resolve({ from, to, all }) });
const render = async (element: Promise<ReactNode>) => renderToStaticMarkup(await element);
beforeEach(() => {
  country = countryFixture(); vi.mocked(api.getCountry).mockResolvedValue(country); vi.mocked(api.getWikiPage).mockResolvedValue(null); vi.mocked(currentUser).mockResolvedValue(null);
  vi.mocked(requestAnonymousBrowsingPolicy).mockResolvedValue({ allowed: true, serverDefault: true, override: null }); vi.mocked(listDocumentLinks).mockResolvedValue([]);
  vi.mocked(api.listCountries).mockResolvedValue([{ id: country.id, isoCode: 'XA', name: country.name, versionCount: 2, latestVersionId: nextLaw.id, latestVersionLabel: '1956', latestEffectiveDate: '1956-01-01' }]);
  vi.mocked(api.listArticlePage).mockResolvedValue({ items: [], total: 7, offset: 0, limit: 1 });
  vi.mocked(api.listConstitutionAmendments).mockResolvedValue([instrument]); vi.mocked(api.listAmendments).mockResolvedValue([]);
  vi.mocked(api.getReaderOutline).mockResolvedValue(null);
  vi.mocked(api.listAllUnits).mockImplementation(async id => id === nextLaw.id ? [article('new-1', '1', 'Every adult citizen may vote.'), article('new-2', '2', 'Unchanged guarantee.'), article('new-4', '4', 'New guarantee.')] : [article('old-1', '1', 'Some citizens may vote.'), article('old-2', '2', 'Unchanged guarantee.'), article('old-3', '3', 'Repealed guarantee.')]);
  vi.mocked(api.getVersion).mockImplementation(async id => {
    const item = [original, correction, nextLaw].find(v => v.id === id);
    return item ? { ...item, constitutionId: 'charter', publicationStatus: 'published' } : null;
  });
  vi.mocked(api.listAllArticles).mockImplementation(async id => id === nextLaw.id ? [article('new-1', '1', 'Every adult citizen may vote.')] : [article('old-1', '1', 'Some citizens may vote.')]);
  vi.mocked(api.listAmendmentsByArticle).mockResolvedValue([instrument]);
  vi.mocked(api.getUnit).mockResolvedValue({ ...article('old-1', '1', 'Some citizens may vote.'), title: 'Historical provision', body: 'Some citizens may vote.' });
  vi.mocked(api.getConstitutionLifecycle).mockResolvedValue([{ id: 'commencement', constitutionId: 'charter', eventType: 'commenced', eventDate: '1949-05-23', sourceUrl: 'https://archive.example/charter', note: 'Original commencement', dateCertainty: 'exact' }]);
  vi.mocked(api.getProvisionLifecycle).mockResolvedValue([]);
});
afterEach(async () => { if (mounted) await act(async () => mounted!.unmount()); mounted = undefined; vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('public discovery and legal identity selection', () => {
  it('links one chip per legal edition and reads each current editorial tip', async () => {
    const html = await render(Country({ params: params() }));
    expect(html).toContain('/countries/XA/versions/correction-1949'); expect(html).toContain('/countries/XA/versions/law-1956');
    const dom = new DOMParser().parseFromString(html, 'text/html');
    expect([...dom.querySelectorAll('.chip-row a')].map(link => link.textContent?.trim())).toEqual(['1949', '1956']);
    expect(html).not.toContain('/editor/wiki/');
  });
  it('shows editorial links only to staff and lifecycle entry only to publishers/admins', async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: 'author', email: 'author@example.test', roles: ['editor'] });
    const editor = await render(Country({ params: params() })); expect(editor).toContain('/editor/wiki/'); expect(editor).not.toContain('/editor/lifecycle/');
    vi.mocked(currentUser).mockResolvedValue({ id: 'publisher', email: 'publisher@example.test', roles: ['publisher'] });
    expect(await render(Country({ params: params() }))).toContain('/editor/lifecycle/charter');
  });
  it('keeps the country readable when optional contextual documents are unavailable', async () => {
    vi.mocked(api.getWikiPage).mockRejectedValue(new Error('offline')); vi.mocked(listDocumentLinks).mockRejectedValue(new Error('offline'));
    const html = await render(Country({ params: params() })); expect(html).toContain('Republic Charter'); expect(html).toContain('/versions/law-1956');
  });
  it('counts public editions and current-tip content on the homepage', async () => {
    const html = await render(Home()); expect(html).toContain('Test Republic'); expect(html).toContain('/versions/law-1956');
    expect(html).toContain('<strong>2</strong>'); expect(html).toContain('<strong>7</strong>'); expect(html).toContain('Article 1'); expect(html).toContain('1956-01-01');
    expect(api.listArticlePage).toHaveBeenCalledWith('law-1956', 0, 1);
  });
  it('keeps discovery available when optional content and amendment statistics fail', async () => {
    vi.mocked(api.listArticlePage).mockRejectedValue(new Error('offline')); vi.mocked(api.listConstitutionAmendments).mockRejectedValue(new Error('offline'));
    expect(await render(Home())).toContain('Test Republic');
  });
  it('does not load public content when anonymous browsing is closed', async () => {
    vi.mocked(requestAnonymousBrowsingPolicy).mockResolvedValue({ allowed: false, serverDefault: false, override: null });
    const html = await render(Home()); expect(html).toContain('href="/login"'); expect(api.listCountries).not.toHaveBeenCalled();
  });
  it('permits a verified user to browse while anonymous access is closed', async () => {
    vi.mocked(requestAnonymousBrowsingPolicy).mockResolvedValue({ allowed: false, serverDefault: false, override: null });
    vi.mocked(currentUser).mockResolvedValue({ id: 'viewer', email: 'viewer@example.test', roles: ['viewer'] });
    expect(await render(Home())).toContain('Test Republic');
  });
  it('shows an empty catalogue without fabricated version links', async () => {
    vi.mocked(api.listCountries).mockResolvedValue([]); const html = await render(Home()); expect(html).toContain('No countries'); expect(html).not.toContain('/versions/law-1956');
  });
});

describe('published snapshots and comparison', () => {
  it('keeps a known historical snapshot rather than silently replacing its text', async () => {
    const html = (await expandedReader()).innerHTML;
    expect(api.listAllUnits).toHaveBeenCalledWith('law-1949', true); expect(html).toContain('Some citizens may vote.'); expect(html).not.toContain('Every adult citizen may vote.');
    expect(html).toContain('/versions/correction-1949');
  });
  it('preserves required reading content when optional amendment history fails', async () => {
    vi.mocked(api.listAmendments).mockRejectedValue(new Error('offline')); expect((await expandedReader()).textContent).toContain('Some citizens may vote.');
  });
  it('does not expose unpublished snapshots through a known URL', async () => {
    vi.mocked(api.getVersion).mockResolvedValue({ ...original, constitutionId: 'charter', publicationStatus: 'draft' });
    await expect(Version(versionProps())).rejects.toThrow('not-found');
  });
  it('compares explicitly selected snapshot content and hides unchanged passages by default', async () => {
    const html = await render(Compare(compareProps()));
    expect(api.listAllUnits).toHaveBeenCalledWith('law-1949', true); expect(api.listAllUnits).toHaveBeenCalledWith('law-1956', true);
    const text = new DOMParser().parseFromString(html, 'text/html').body.textContent; expect(text).toContain('Some citizens'); expect(text).toContain('Every adult'); expect(html).toContain('New guarantee.'); expect(html).toContain('Repealed guarantee.'); expect(html).not.toContain('Unchanged guarantee.');
    expect(html).toContain('all=1'); expect(html).not.toContain('Needs review');
  });
  it('shows unchanged passages only when explicitly requested', async () => {
    expect(await render(Compare(compareProps(original.id, nextLaw.id, '1')))).toContain('Unchanged guarantee.');
  });
  it('defaults comparison to the current editorial tips of the legal editions', async () => {
    await Compare({ params: params(), searchParams: Promise.resolve({}) });
    expect(api.listAllUnits).toHaveBeenCalledWith('correction-1949', true); expect(api.listAllUnits).toHaveBeenCalledWith('law-1956', true);
  });
  it('preserves the staff quote-review warning without exposing draft records to anonymous reads', async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: 'reviewer', email: 'reviewer@example.test', roles: ['reviewer'] });
    const html = await render(Compare(compareProps())); expect(html).toContain('Needs review');
    expect(api.listConstitutionAmendments).toHaveBeenCalledWith('charter', { status: 'all', authorization: 'Bearer staff-session' });
  });
  it('does not load passage data for an invalid comparison pair', async () => {
    const html = await render(Compare(compareProps(original.id, original.id))); expect(html).toContain('role="alert"'); expect(api.listAllUnits).not.toHaveBeenCalled();
  });
  it('shows recovery instead of a misleading empty comparison when content fails', async () => {
    vi.mocked(api.listAllUnits).mockRejectedValue(new Error('offline')); const html = await render(Compare(compareProps())); expect(html).toContain('role="alert"'); expect(html).not.toContain('compare-summary');
  });
});

describe('history and unavailable resources', () => {
  it('combines sourced lifecycle and amendment events without creating editorial laws', async () => {
    const html = await render(Timeline({ params: params(), searchParams: Promise.resolve({ on: '1950-01-01' }) }));
    expect(html).toContain('Original commencement'); expect(html).toContain('Voting reform'); expect(html).toContain('1950-01-01'); expect(html).toContain('Official reform');
  });
  it('preserves lifecycle history and warns when amendment history is unavailable', async () => {
    vi.mocked(api.listConstitutionAmendments).mockRejectedValue(new Error('offline'));
    const html = await render(Timeline({ params: params(), searchParams: Promise.resolve({}) })); expect(html).toContain('Original commencement'); expect(html).toContain('role="alert"');
  });
  it('filters amendment events without hiding the date status control', async () => {
    const html = await render(Timeline({ params: params(), searchParams: Promise.resolve({ events: 'amendment', on: '1950-01-01' }) }));
    expect(html).toContain('Voting reform'); expect(html).not.toContain('Original commencement'); expect(html).toContain('1950-01-01');
  });
  it('returns not-found for an unknown country on public routes', async () => {
    vi.mocked(api.getCountry).mockResolvedValue(null);
    await expect(Country({ params: params() })).rejects.toThrow('not-found'); await expect(Compare(compareProps())).rejects.toThrow('not-found');
  });
  it('shows retry states for a catalogue outage on public routes', async () => {
    vi.mocked(api.getCountry).mockRejectedValue(new api.ApiUnavailableError('catalog'));
    for (const page of [Country({ params: params() }), Version(versionProps()), Compare(compareProps()), Timeline({ params: params(), searchParams: Promise.resolve({}) }), Home()]) expect(await render(page)).toContain('role="status"');
  });
  it('builds metadata from legal labels and keeps the requested snapshot permalink', async () => {
    expect((await countryMetadata({ params: params() })).title).toContain('Test Republic');
    expect((await versionMetadata(versionProps('law-1949'))).alternates?.canonical).toContain('/versions/law-1949');
    expect((await compareMetadata(compareProps())).title).toContain('1949');
  });
});


describe('article permalinks and legal-edition history', () => {
  const articleProps = () => ({ params: Promise.resolve({ code: 'XA', versionId: 'law-1949', articleId: 'old-1' }), searchParams: Promise.resolve({}) });
  const historyProps = () => ({ params: Promise.resolve({ code: 'XA', articleNumber: '1' }) });
  it('renders the requested historical unit with a stable snapshot permalink', async () => {
    const output = await render(ArticlePage(articleProps())); expect(output).toContain('Some citizens may vote.'); expect(output).toContain('/countries/XA/versions/law-1949/articles/old-1'); expect(output).toContain('/versions/correction-1949');
    expect((await articleMetadata(articleProps())).alternates?.canonical).toContain('/versions/law-1949/articles/old-1');
  });
  it('rejects a unit returned from a different snapshot rather than presenting it at the requested permalink', async () => {
    vi.mocked(api.getUnit).mockResolvedValue({ ...article('new-1', '1', 'Different legal wording.'), title: 'Different provision', body: 'Different legal wording.' });
    await expect(ArticlePage(articleProps())).rejects.toThrow('not-found');
  });
  it('shows each legal edition using its current editorial transcription in article history', async () => {
    const output = await render(ArticleHistory(historyProps())); expect(output).toContain('Some citizens may vote.'); expect(output).toContain('Every adult citizen may vote.'); expect(api.listAllArticles).toHaveBeenCalledWith('correction-1949', true); expect(api.listAllArticles).toHaveBeenCalledWith('law-1956', true); expect(output).toContain('/compare?from=law-1949');
  });
  it('preserves article history when optional change records fail', async () => {
    vi.mocked(api.listAmendmentsByArticle).mockRejectedValue(new Error('offline')); expect(await render(ArticleHistory(historyProps()))).toContain('Some citizens may vote.');
  });
  it('distinguishes an unknown article from unavailable historical content', async () => {
    vi.mocked(api.listAllArticles).mockResolvedValue([]); await expect(ArticleHistory(historyProps())).rejects.toThrow('not-found');
    vi.mocked(api.listAllArticles).mockRejectedValue(new Error('offline')); expect(await render(ArticleHistory(historyProps()))).toContain('role="alert"');
  });
});
