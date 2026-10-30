import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConstitutionSummary, VersionSummary } from './api';
import { constitutionHref, constitutionReading, countryOwner, groupConstitutions, jurisdictionHref, jurisdictionOwner, loadRegionalCollections } from './country-directory';
import { getJurisdiction, type Jurisdiction, type JurisdictionDetail } from './migration-api';

vi.mock('./migration-api', () => ({ getJurisdiction: vi.fn() }));

const version = (id: string, extra: Partial<VersionSummary> = {}): VersionSummary => ({
  id, versionLabel: id, effectiveDate: '2000-01-01', languageCode: 'en', sourceUrl: null, gazetteReference: null,
  provenance: 'official', verificationState: 'verified', verifiedBy: null, verifiedAt: null, latestPublished: false, ...extra,
});
const constitution = (id: string, lifecycleStatus?: string): ConstitutionSummary => ({ id, title: id, slug: id, lifecycleStatus, versions: [version(`${id}-v`)] });
const jurisdiction = (id: string, parentId: string | null = null, historical = false): Jurisdiction => ({ id, parentId, name: id, slug: id, kind: parentId ? 'region' : 'country', code: parentId ? null : 'DE', historical, existedFrom: null, existedUntil: null });
const detail = (entity: Jurisdiction, children: Jurisdiction[] = []): JurisdictionDetail => ({ jurisdiction: entity, children, ancestors: [], constitutions: [constitution(`${entity.id}-constitution`)] });

describe('country directory contracts', () => {
  beforeEach(() => vi.resetAllMocks());

  it('classifies only known repealed constitutions as historical and excludes staff-only entries', () => {
    const hidden = { ...constitution('hidden'), versions: [version('private', { listing: 'staff' })] };
    const result = groupConstitutions([constitution('current', 'in_force'), constitution('future', 'awaiting_commencement'), constitution('unknown'), constitution('suspended', 'suspended'), constitution('uncertain', 'uncertain'), constitution('old', 'repealed'), hidden]);
    expect(result.current.map(item => item.id)).toEqual(['current', 'future', 'unknown', 'suspended', 'uncertain']);
    expect(result.historical.map(item => item.id)).toEqual(['old']);
  });

  it('reads the current published transcription without exposing staff identities or trusting a private latestVersionId', () => {
    const item = { ...constitution('c'), latestVersionId: 'private-tip', versions: [version('old'), version('legal', { legalVersionId: 'legal', currentVersionId: 'corrected', latestPublished: true }), version('private-tip', { listing: 'staff', hopKind: 'editorial_correction', latestPublished: true })] };
    const reading = constitutionReading(item);
    expect(reading.versions.map(item => item.id)).toEqual(['old', 'legal']);
    expect(reading.latestSnapshotId).toBe('corrected');
  });

  it('does not offer a reading target when no public legal version exists', () => {
    expect(constitutionReading({ ...constitution('c'), versions: [version('private', { listing: 'staff' })] }).latestSnapshotId).toBeUndefined();
  });

  it('keeps country and regional routes scoped to their owner', () => {
    const country = countryOwner({ isoCode: 'DE', name: 'Germany' });
    const region = jurisdiction('r', 'DE');
    expect(constitutionHref(country, 'c')).toBe('/countries/DE/constitutions/c');
    expect(constitutionHref(jurisdictionOwner(region), 'c')).toBe('/jurisdictions/r/constitutions/c');
    expect(jurisdictionHref(jurisdiction('root'))).toBe('/countries/DE');
    expect(jurisdictionHref({ ...region, historical: true, code: 'DE', kind: 'country' })).toBe('/jurisdictions/r');
  });

  it('loads descendants, including historical and nested jurisdictions, once each', async () => {
    const root = jurisdiction('root'), region = jurisdiction('region', 'root'), former = jurisdiction('former', 'root', true), city = jurisdiction('city', 'region');
    const fixtures = new Map([['root', detail(root, [region, former, region])], ['region', detail(region, [city])], ['former', detail(former)], ['city', detail(city, [region])]]);
    vi.mocked(getJurisdiction).mockImplementation(async id => fixtures.get(id) ?? null);
    const result = await loadRegionalCollections('root');
    expect(result.unavailable).toBe(false);
    expect(result.regions.map(item => item.detail.jurisdiction.id).sort()).toEqual(['city', 'former', 'region']);
    expect(result.regions.find(item => item.detail.jurisdiction.id === 'city')?.ancestors.map(item => item.id)).toEqual(['root', 'region']);
    expect(getJurisdiction).toHaveBeenCalledTimes(4);
  });

  it('retains available regions and reports partial failures instead of claiming the catalog is empty', async () => {
    const root = jurisdiction('root'), good = jurisdiction('good', 'root'), broken = jurisdiction('broken', 'root');
    vi.mocked(getJurisdiction).mockImplementation(async id => { if (id === 'root') return detail(root, [good, broken]); if (id === 'good') return detail(good); throw new Error('offline'); });
    const result = await loadRegionalCollections('root');
    expect(result.unavailable).toBe(true);
    expect(result.regions.map(item => item.detail.jurisdiction.id)).toEqual(['good']);
  });

  it('rejects a region returned under a different country', async () => {
    const root = jurisdiction('root'), region = jurisdiction('region', 'root');
    vi.mocked(getJurisdiction).mockImplementation(async id => id === 'root' ? detail(root, [region]) : detail({ ...region, parentId: 'elsewhere' }));
    expect(await loadRegionalCollections('root')).toEqual({ regions: [], unavailable: true });
  });
});
