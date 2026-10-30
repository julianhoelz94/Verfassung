import { beforeEach, expect, it, vi } from 'vitest';
import type { ConstitutionSummary, VersionDetail, VersionSummary } from './api';
import { getVersion } from './api';
import { loadConstitutionCollection } from './country-directory';
import { generateMetadata } from '../app/countries/[code]/compare/ConstitutionComparison';

vi.mock('./api', async importOriginal => ({ ...await importOriginal<typeof import('./api')>(), getVersion: vi.fn() }));
vi.mock('./country-directory', async importOriginal => ({ ...await importOriginal<typeof import('./country-directory')>(), loadConstitutionCollection: vi.fn() }));

function version(id: string, label: string, currentVersionId: string, effectiveDate: string): VersionSummary {
  return { id, versionLabel: label, currentVersionId, legalVersionId: id, effectiveDate, languageCode: 'en', sourceUrl: null, gazetteReference: null, provenance: 'official', verificationState: 'verified', verifiedAt: null, verifiedBy: null, latestPublished: label === '2020' };
}
const versions = [version('legal-a', '2000', 'current-a', '2000-01-01'), version('legal-b', '2020', 'current-b', '2020-01-01')];
const constitution: ConstitutionSummary = { id: 'constitution', slug: 'constitution', title: 'Regional Constitution', versions };
const context = { collection: { id: 'region', isoCode: 'region', name: 'Example Region', constitutions: [constitution] }, owner: { jurisdictionId: 'region', name: 'Example Region', href: '/jurisdictions/region' }, ancestors: [] };

beforeEach(() => { vi.resetAllMocks(); vi.mocked(loadConstitutionCollection).mockResolvedValue(context); });

it('labels corrected public versions and keeps the jurisdiction comparison URL', async () => {
  const metadata = await generateMetadata({ params: Promise.resolve({ id: 'region' }), searchParams: Promise.resolve({ from: 'current-a', to: 'current-b' }) });
  expect(metadata.title).toContain('Compare 2000 → 2020');
  expect(String(metadata.alternates?.canonical)).toContain('/jurisdictions/region/compare?from=current-a&to=current-b');
  expect(getVersion).not.toHaveBeenCalled();
});

it('keeps an explicitly requested older published transcription pinned in its canonical URL', async () => {
  vi.mocked(getVersion).mockResolvedValue({ id: 'archived-a', constitutionId: constitution.id, legalVersionId: 'legal-a', versionLabel: '2000', effectiveDate: '2000-01-01', languageCode: 'en', publicationStatus: 'published' } satisfies VersionDetail);
  const metadata = await generateMetadata({ params: Promise.resolve({ id: 'region' }), searchParams: Promise.resolve({ from: 'archived-a', to: 'current-b' }) });
  expect(metadata.title).toContain('Compare 2000 → 2020');
  expect(String(metadata.alternates?.canonical)).toContain('from=archived-a&to=current-b');
});

it('does not label or canonicalize a snapshot from an unrelated constitution', async () => {
  vi.mocked(getVersion).mockResolvedValue({ id: 'foreign', constitutionId: 'different', legalVersionId: 'legal-a', versionLabel: 'PRIVATE FOREIGN TITLE', effectiveDate: null, languageCode: 'en', publicationStatus: 'published' });
  const metadata = await generateMetadata({ params: Promise.resolve({ id: 'region' }), searchParams: Promise.resolve({ from: 'foreign', to: 'current-b' }) });
  expect(metadata.title).not.toContain('PRIVATE FOREIGN TITLE');
  expect(String(metadata.alternates?.canonical)).not.toContain('from=');
});

it('defaults to the current published snapshot of each endpoint', async () => {
  const metadata = await generateMetadata({ params: Promise.resolve({ id: 'region' }), searchParams: Promise.resolve({}) });
  expect(String(metadata.alternates?.canonical)).toContain('from=current-a&to=current-b');
});
