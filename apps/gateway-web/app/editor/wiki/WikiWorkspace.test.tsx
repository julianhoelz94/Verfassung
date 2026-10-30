import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getCountry, getWikiDraft, getWikiHistory, getWikiPage } from '../../../lib/api';
import { getJurisdiction } from '../../../lib/migration-api';
import { currentUser } from '../../../lib/session';
import { ConstitutionWikiPanel, WikiWorkspace } from './WikiWorkspace';

vi.mock('../../../lib/session', () => ({ currentUser: vi.fn(), requireSessionBearer: vi.fn().mockResolvedValue('Bearer staff') }));
vi.mock('../../../lib/api', () => ({ getCountry: vi.fn(), getWikiDraft: vi.fn(), getWikiHistory: vi.fn(), getWikiPage: vi.fn() }));
vi.mock('../../../lib/migration-api', () => ({ getJurisdiction: vi.fn() }));
vi.mock('../../../lib/server-locale', () => ({ currentLocale: vi.fn().mockResolvedValue('en') }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error('redirect:'+url); }, notFound: () => { throw new Error('not-found'); } }));
vi.mock('./actions', () => ({ saveWikiAction: vi.fn(), publishWikiAction: vi.fn() }));
vi.mock('../../components/WikiBody', () => ({ WikiBody: ({ body }: { body: string }) => <p>{body}</p> }));
vi.mock('../../components/WikiSources', () => ({ WikiSources: ({ sourceUrls }: { sourceUrls: string[] }) => <p>{sourceUrls.join(' ')}</p> }));

const constitutionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const current = { id: 'wiki-draft', summary: 'Constitution context', body: 'A paragraph about the constitution.', sourceUrls: ['https://archive.example/source'], images: [] };
beforeEach(() => {
  vi.mocked(currentUser).mockResolvedValue({ id: 'editor', email: 'editor@example.test', roles: ['editor'] });
  vi.mocked(getWikiDraft).mockResolvedValue(current as Awaited<ReturnType<typeof getWikiDraft>>);
  vi.mocked(getWikiPage).mockResolvedValue(null); vi.mocked(getWikiHistory).mockResolvedValue([]);
  vi.mocked(getCountry).mockResolvedValue({ id: constitutionId, isoCode: 'XA', name: 'Example country', constitutions: [] });
  vi.mocked(getJurisdiction).mockResolvedValue({ jurisdiction: { id: constitutionId, name: 'Former region', slug: 'former-region', kind: 'region', parentId: null, code: null, historical: true, existedFrom: null, existedUntil: '1900-01-01' }, ancestors: [], children: [], constitutions: [] });
});

describe('embedded constitution Wiki', () => {
  it('keeps independent draft identity and discloses sources and pictures on demand', async () => {
    const html = renderToStaticMarkup(await ConstitutionWikiPanel({ constitutionId, code: 'XA', returnTo: '/editor?sessionId=session&versionId=version', status: 'saved' }));
    const host = document.createElement('div'); host.innerHTML = html;
    expect(host.querySelector('[name=expectedRevisionId]')?.getAttribute('value')).toBe('wiki-draft');
    expect(host.querySelector('[name=returnTo]')?.getAttribute('value')).toContain('sessionId=session');
    expect(host.querySelector('[name=targetType]')?.getAttribute('value')).toBe('constitution');
    expect(host.querySelector('[name=summary]')?.closest('details')).toBeNull();
    expect(host.querySelector('[name=body]')?.closest('details')).toBeNull();
    expect(host.querySelector('[name=sourceUrls]')?.closest('details')?.open).toBe(false);
    expect(host.querySelector('[name=imageFile]')?.closest('details')?.open).toBe(false);
    expect(html).toContain('Save Wiki draft'); expect(html).toContain('Draft saved');
    expect(host.querySelectorAll('form form')).toHaveLength(0);
  });
  it('offers publication only to a publisher and keeps selected revision explicit', async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: 'publisher', email: 'publisher@example.test', roles: ['publisher'] });
    const html = renderToStaticMarkup(await WikiWorkspace({ targetType: 'constitution', targetId: constitutionId, query: { code: 'XA' }, embedded: true }));
    expect(html).toContain('Publish page'); expect(html).toContain('name="revisionId" value="wiki-draft"');
    expect(html).not.toContain('Save Wiki draft');
  });
  it('isolates optional Wiki failure from the legal text workspace', async () => {
    vi.mocked(getWikiDraft).mockRejectedValueOnce(new Error('unavailable'));
    const html = renderToStaticMarkup(await ConstitutionWikiPanel({ constitutionId, code: 'XA', returnTo: '/editor?sessionId=session&versionId=version' }));
    expect(html).toContain('Your text draft is still available'); expect(html).toContain('Open Wiki editor');
    expect(html).not.toContain('unavailable');
  });
  it('preserves the text session and Wiki tab while paging revision history', async () => {
    vi.mocked(getWikiHistory).mockResolvedValue(Array.from({ length: 26 }, (_, index) => ({ ...current, id: 'history-'+index })) as Awaited<ReturnType<typeof getWikiHistory>>);
    const html = renderToStaticMarkup(await ConstitutionWikiPanel({ constitutionId, code: 'XA', returnTo: '/editor?sessionId=session&versionId=version&articleId=article', historyPage: '2' }));
    const host = document.createElement('div'); host.innerHTML = html;
    const hrefs = Array.from(host.querySelectorAll('nav a')).map(link => new URL(link.getAttribute('href')!, 'http://atlas.local'));
    expect(hrefs).toHaveLength(2); expect(hrefs.map(url => url.searchParams.get('wikiHistoryPage'))).toEqual(['1','3']);
    for (const url of hrefs) { expect(url.pathname).toBe('/editor'); expect(url.searchParams.get('sessionId')).toBe('session'); expect(url.searchParams.get('versionId')).toBe('version'); expect(url.searchParams.get('tab')).toBe('wiki'); }
    expect(getWikiHistory).toHaveBeenLastCalledWith('constitution', constitutionId, 'Bearer staff', 2);
  });
  it('rejects unrelated targets before any Wiki fetch', async () => {
    vi.mocked(getWikiDraft).mockClear();
    await expect(WikiWorkspace({ targetType: 'version', targetId: constitutionId, query: { code: 'XA' } })).rejects.toThrow('not-found');
    expect(getWikiDraft).not.toHaveBeenCalled();
  });
  it('opens a named wiki workspace for a historical jurisdiction without requiring a country code', async () => {
    const html = renderToStaticMarkup(await WikiWorkspace({ targetType: 'jurisdiction', targetId: constitutionId, query: {} }));
    const host = document.createElement('div'); host.innerHTML = html;
    expect(host.querySelector('h1')?.textContent).toBe('Edit wiki · Former region');
    expect(host.querySelector('[name=targetType]')?.getAttribute('value')).toBe('jurisdiction');
    expect(host.querySelector('a[href*="?wiki=1"]')?.getAttribute('href')).toBe(`/jurisdictions/${constitutionId}?wiki=1`);
    expect(getWikiDraft).toHaveBeenLastCalledWith('jurisdiction', constitutionId, 'Bearer staff');
  });
  it('preserves a country wiki owner and rejects a conflicting country id', async () => {
    const html = renderToStaticMarkup(await WikiWorkspace({ targetType: 'country', targetId: constitutionId, query: { code: 'XA' } }));
    expect(html).toContain('Edit wiki · Example country');
    expect(html).toContain('/countries/XA?wiki=1');
    await expect(WikiWorkspace({ targetType: 'country', targetId: 'different-country', query: { code: 'XA' } })).rejects.toThrow('not-found');
  });
  it('lets a reviewer inspect a jurisdiction draft without save or publish controls', async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: 'reviewer', email: 'reviewer@example.test', roles: ['reviewer'] });
    const html = renderToStaticMarkup(await WikiWorkspace({ targetType: 'jurisdiction', targetId: constitutionId, query: {} }));
    expect(html).toContain('Review wiki · Former region');
    expect(html).toContain('A paragraph about the constitution.');
    expect(html).not.toContain('Save Wiki draft'); expect(html).not.toContain('Publish page');
  });
});
