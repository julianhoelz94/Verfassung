import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import CountryPage from '../countries/[code]/page';
import JurisdictionPage from '../jurisdictions/[id]/page';
import { ConstitutionHistoryPage as ConstitutionOverview } from './history/ConstitutionHistoryPage';
import { getCountry, getConstitutionEvents, getWikiPage, listConstitutionAmendments, listAllUnits, resolveUnit, type ConstitutionSummary, type VersionSummary } from '../../lib/api';
import { getJurisdiction, type JurisdictionDetail } from '../../lib/migration-api';
import { listDocumentLinks } from '../../lib/document-api';
import { currentUser } from '../../lib/session';

vi.mock('../../lib/api', () => ({ getCountry: vi.fn(), getConstitutionEvents: vi.fn(), listConstitutionAmendments: vi.fn(), getWikiPage: vi.fn(), listAllUnits: vi.fn(), resolveUnit: vi.fn() }));
vi.mock('../../lib/migration-api', () => ({ getJurisdiction: vi.fn() }));
vi.mock('../../lib/document-api', () => ({ listDocumentLinks: vi.fn() }));
vi.mock('../../lib/session', () => ({ currentUser: vi.fn() }));
vi.mock('../../lib/server-locale', () => ({ currentLocale: vi.fn().mockResolvedValue('en') }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found'); } }));
vi.mock('./VersionDocuments', () => ({VersionDocuments: () => null}));
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
  vi.mocked(listConstitutionAmendments).mockResolvedValue([]);
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
  const page = markup(await ConstitutionOverview({ params: Promise.resolve({ id: 'province', constitutionId: 'charter' }), searchParams:Promise.resolve({}) }));
  expect(page.querySelector('h1')?.textContent).toBe('A constitution, over time.');
  expect(page.querySelector('a[href="/jurisdictions/province/versions/published-snapshot"]')).not.toBeNull();
  expect(page.querySelector('a[href="/jurisdictions/province/constitutions/charter?kind=amendment"]')).not.toBeNull();
  expect(page.querySelector('a[href^="/jurisdictions/province/constitutions/charter/events/event"]')).not.toBeNull();
  expect(page.querySelector('a[href="/jurisdictions/province/timeline"]')).toBeNull();
  expect(page.textContent).toContain('Recorded repeal');
});

it('rejects a constitution belonging to another region and distinguishes catalog failure from absence', async () => {
  await expect(ConstitutionOverview({ params: Promise.resolve({ id: 'province', constitutionId: 'elsewhere' }), searchParams:Promise.resolve({}) })).rejects.toThrow('not-found');
  vi.mocked(getJurisdiction).mockRejectedValue(new Error('catalog offline'));
  const failed = markup(await ConstitutionOverview({ params: Promise.resolve({ id: 'province', constitutionId: 'charter' }), searchParams:Promise.resolve({}) }));
  expect(failed.querySelector('a[href="/jurisdictions/province/constitutions/charter"]')).not.toBeNull();
});

it('keeps passage History grouped and renders exact reference-only wording with a return to the source', async () => {
  const beforeRef = {versionId: 'published-snapshot', logicalId: 'assembly', occurrenceId: 'before-occ', revisionId: 'before-rev'};
  const afterRef = {...beforeRef, versionId: 'next-pin', occurrenceId: 'after-occ', revisionId: 'after-rev'};
  vi.mocked(listConstitutionAmendments).mockResolvedValue([{
    id: 'act', title: 'Assembly amendment', summary: '', enactedOn: '2024-01-01', sourceReference: null,
    sourceVersionId: beforeRef.versionId, targetVersionId: afterRef.versionId,
    changes: [{id: 'change', articleId: null, articleNumber: '1', changeType: 'changed', note: 'Public explanation', beforeRef, afterRef}],
  }]);
  vi.mocked(listAllUnits).mockResolvedValue([{id: 'before-occ', logicalId: 'assembly', versionId: 'published-snapshot', articleNumber: '1', title: 'Assembly', sortOrder: 1, content: []}]);
  vi.mocked(resolveUnit).mockImplementation(async versionId => ({
    ...(versionId === beforeRef.versionId ? beforeRef : afterRef), constitutionId: 'charter',
    pathLabels: ['Article 1'], deepLink: `/countries/DE/versions/${versionId}#unit`,
    text: versionId === beforeRef.versionId ? 'Citizens may assemble.' : 'Everyone may assemble.',
  }));
  const page = markup(await ConstitutionOverview({params: Promise.resolve({code: 'DE', constitutionId: 'charter'}), searchParams: Promise.resolve({passage: 'assembly', sourceVersion: 'published-snapshot', sourceAnchor: 'before-occ'})}));
  const group = page.querySelector('[aria-labelledby="history-year-2024"]')!;
  expect(group.querySelectorAll('article')).toHaveLength(1);
  expect(group.querySelector('[data-passage-side="before"]')?.textContent).toContain('Citizens may assemble.');
  expect(group.querySelector('[data-passage-side="after"]')?.textContent).toContain('Everyone may assemble.');
  expect(page.querySelector('a[href="/countries/DE/versions/published-snapshot#unit-before-occ"]')?.textContent).toContain('Back to viewer');
  expect([...group.querySelectorAll('a')].some(link => link.textContent === '1900')).toBe(true);
});
