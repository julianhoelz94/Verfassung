import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import CountryPage from '../countries/[code]/page';
import JurisdictionPage from '../jurisdictions/[id]/page';
import { ConstitutionOverview } from './ConstitutionOverview';
import { getCountry, getConstitutionEvents, getWikiPage, type ConstitutionSummary, type VersionSummary } from '../../lib/api';
import { getJurisdiction, type JurisdictionDetail } from '../../lib/migration-api';
import { listDocumentLinks } from '../../lib/document-api';
import { currentUser } from '../../lib/session';

vi.mock('../../lib/api', () => ({ getCountry: vi.fn(), getConstitutionEvents: vi.fn(), getWikiPage: vi.fn() }));
vi.mock('../../lib/migration-api', () => ({ getJurisdiction: vi.fn() }));
vi.mock('../../lib/document-api', () => ({ listDocumentLinks: vi.fn() }));
vi.mock('../../lib/session', () => ({ currentUser: vi.fn() }));
vi.mock('../../lib/server-locale', () => ({ currentLocale: vi.fn().mockResolvedValue('en') }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found'); } }));
vi.mock('./ContentTranslationRegion', () => ({ ContentTranslationRegion: ({ children }: { children: ReactNode }) => children }));

const version: VersionSummary = { id: 'published-snapshot', versionLabel: '1900', effectiveDate: '1900-01-01', languageCode: 'en', sourceUrl: null, gazetteReference: null, provenance: 'official', verificationState: 'verified', verifiedBy: null, verifiedAt: null, latestPublished: true };
const charter: ConstitutionSummary = { id: 'charter', title: 'Provincial Charter', slug: 'charter', lifecycleStatus: 'repealed', versions: [version] };
const region: JurisdictionDetail = { jurisdiction: { id: 'province', parentId: 'country', name: 'Former Province', slug: 'province', kind: 'region', code: null, historical: true, existedFrom: null, existedUntil: '1950-01-01' }, ancestors: [{ id: 'country', parentId: null, name: 'Germany', slug: 'germany', kind: 'country', code: 'DE', historical: false, existedFrom: null, existedUntil: null }], children: [], constitutions: [charter] };
function markup(node: ReactNode) { const host = document.createElement('div'); host.innerHTML = renderToStaticMarkup(node); return host; }

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCountry).mockResolvedValue({ id: 'country', isoCode: 'DE', name: 'Germany', constitutions: [charter] });
  vi.mocked(getJurisdiction).mockImplementation(async id => id === 'province' ? region : { ...region, jurisdiction: region.ancestors[0], ancestors: [], children: [region.jurisdiction], constitutions: [charter] });
  vi.mocked(getWikiPage).mockResolvedValue(null);
  vi.mocked(getConstitutionEvents).mockResolvedValue([]);
  vi.mocked(listDocumentLinks).mockResolvedValue([]);
  vi.mocked(currentUser).mockResolvedValue(null);
});

it('keeps public country and former-region wikis available before any page is published', async () => {
  const country = markup(await CountryPage({ params: Promise.resolve({ code: 'DE' }), searchParams: Promise.resolve({ wiki: '1' }) }));
  const province = markup(await JurisdictionPage({ params: Promise.resolve({ id: 'province' }), searchParams: Promise.resolve({ wiki: '1' }) }));
  for (const page of [country, province]) {
    expect(page.querySelector('[aria-label="Wiki"]')?.hasAttribute('hidden')).toBe(false);
    expect(page.querySelector('a[href^="/editor/wiki/"]')).toBeNull();
    expect(page.querySelector('article a[href$="/versions/published-snapshot"]')).not.toBeNull();
  }
  expect(province.textContent).toContain('Until January 1, 1950');
  expect(province.textContent).not.toContain('Not recorded');
  expect(province.querySelector('a[href="/countries/DE/timeline"]')).toBeNull();
  expect(country.querySelector('a[href="/jurisdictions/province"]')).not.toBeNull();
});

it('preserves the regional directory during a Wiki outage and gives staff the correct editor entry', async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: 'staff', email: 'editor@example.test', roles: ['editor'] });
  vi.mocked(getWikiPage).mockRejectedValue(new Error('wiki offline'));
  const page = markup(await JurisdictionPage({ params: Promise.resolve({ id: 'province' }) }));
  expect(page.querySelector('h1')?.textContent).toBe('Former Province');
  expect(page.querySelector('[role=status]')?.textContent).toContain('The wiki could not be loaded');
  expect(page.querySelector('a[href="/editor/wiki/jurisdiction/province"]')?.textContent).toBe('Edit wiki');
  expect(page.querySelector('article')?.textContent).toContain('Provincial Charter');
});

it('lets publishers discover review without presenting an editing action', async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: 'publisher', email: 'publisher@example.test', roles: ['publisher'] });
  const page = markup(await CountryPage({ params: Promise.resolve({ code: 'DE' }) }));
  expect(page.querySelector('a[href="/editor/wiki/country/country?code=DE"]')?.textContent).toBe('Review wiki');
});

it('keeps an individual regional overview, its lifecycle and reading links scoped to its owner', async () => {
  vi.mocked(getConstitutionEvents).mockResolvedValue([{ id: 'event', constitutionId: 'charter', eventType: 'repealed', eventDate: '1950-01-01', dateCertainty: 'exact', note: 'Recorded repeal', sourceUrl: 'https://example.org/repeal' }]);
  const page = markup(await ConstitutionOverview({ params: Promise.resolve({ id: 'province', constitutionId: 'charter' }) }));
  expect(page.querySelector('h1')?.textContent).toBe('Provincial Charter');
  expect(page.querySelector('a[href="/jurisdictions/province/versions/published-snapshot"]')).not.toBeNull();
  expect(page.querySelector('a[href="/constitutions/charter/amendments"]')).not.toBeNull();
  expect(page.querySelector('a[href="https://example.org/repeal"]')).not.toBeNull();
  expect(page.querySelector('a[href="/jurisdictions/province/timeline"]')).toBeNull();
  expect(page.textContent).toContain('Recorded repeal');
});

it('rejects a constitution belonging to another region and distinguishes catalog failure from absence', async () => {
  await expect(ConstitutionOverview({ params: Promise.resolve({ id: 'province', constitutionId: 'elsewhere' }) })).rejects.toThrow('not-found');
  vi.mocked(getJurisdiction).mockRejectedValue(new Error('catalog offline'));
  const failed = markup(await ConstitutionOverview({ params: Promise.resolve({ id: 'province', constitutionId: 'charter' }) }));
  expect(failed.querySelector('a[href="/jurisdictions/province/constitutions/charter"]')).not.toBeNull();
});
