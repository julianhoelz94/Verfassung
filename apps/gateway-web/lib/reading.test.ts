import { describe, expect, it } from 'vitest';
import type { ConstitutionSummary, VersionSummary } from './api';
import { chainTipId, latestVersion, newestChanges, previousVersion, publicVersions } from './reading';

function version(partial: Partial<VersionSummary> & Pick<VersionSummary, 'id' | 'versionLabel'>): VersionSummary {
  return {
    effectiveDate: null,
    languageCode: 'de',
    sourceUrl: null,
    gazetteReference: null,
    provenance: 'official',
    verificationState: 'verified',
    verifiedBy: null,
    verifiedAt: null,
    latestPublished: false,
    ...partial,
  };
}

describe('latestVersion', () => {
  it('prefers the latestPublished flag, otherwise the last in canonical order', () => {
    const older = version({ id: 'a', versionLabel: '1949', effectiveDate: '1949-05-23' });
    const newer = version({
      id: 'b',
      versionLabel: '2022',
      effectiveDate: '2022-01-01',
      latestPublished: true,
    });
    expect(latestVersion([older, newer])?.id).toBe('b');
    expect(latestVersion([older])?.id).toBe('a');
  });
});

describe('previousVersion', () => {
  it('returns the version before the last in canonical order', () => {
    const older = version({ id: 'a', versionLabel: '1949', effectiveDate: '1949-05-23' });
    const newer = version({ id: 'b', versionLabel: '2022', effectiveDate: '2022-01-01' });
    expect(previousVersion([older, newer])?.id).toBe('a');
    expect(previousVersion([older])).toBeUndefined();
  });
});

describe('publicVersions', () => {
  it('omits staff-only and editorial correction hops', () => {
    const publicVersion = version({ id: 'a', versionLabel: '1949', listing: 'public' });
    const staff = version({ id: 'b', versionLabel: 'staff', listing: 'staff' });
    const editorial = version({
      id: 'c',
      versionLabel: 'fix',
      hopKind: 'editorial_correction',
      listing: 'public',
    });
    expect(publicVersions([publicVersion, staff, editorial]).map((item) => item.id)).toEqual(['a']);
  });
});

describe('chainTipId', () => {
  it('uses latestVersionId even when that id is not in the public list', () => {
    const constitution: ConstitutionSummary = {
      id: 'c1',
      slug: 'basic-law',
      title: 'Basic Law',
      latestVersionId: 'editorial-tip',
      versions: [
        version({ id: 'a', versionLabel: '1949', effectiveDate: '1949-05-23', listing: 'public' }),
        version({ id: 'b', versionLabel: '2022', effectiveDate: '2022-01-01', listing: 'public', latestPublished: true }),
        version({
          id: 'editorial-tip',
          versionLabel: '2022 fix',
          hopKind: 'editorial_correction',
          listing: 'staff',
        }),
      ],
    };
    expect(chainTipId(constitution)).toBe('editorial-tip');
    expect(publicVersions(constitution.versions).some((item) => item.id === 'editorial-tip')).toBe(false);
  });
});

describe('newestChanges', () => {
  it('keeps the newest rows up to the limit', () => {
    const rows = newestChanges(
      [
        {
          countryName: 'Germany',
          isoCode: 'DE',
          versionId: 'v',
          versionLabel: '2022',
          articleNumber: '1',
          changeType: 'changed',
          date: '2020-01-01',
        },
        {
          countryName: 'Germany',
          isoCode: 'DE',
          versionId: 'v',
          versionLabel: '2022',
          articleNumber: '2',
          changeType: 'added',
          date: '2022-01-01',
        },
      ],
      1,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.articleNumber).toBe('2');
  });
});
