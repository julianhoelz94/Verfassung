import { describe, expect, it } from 'vitest';
import type { ConstitutionSummary, VersionSummary } from './api';
import {
  compareRequestError,
  neighborCompareLinks,
  netArticleKind,
  orderVersions,
  versionPath,
} from './compare';

const v = (id: string, label: string, effectiveDate: string | null = null): VersionSummary => ({
  id,
  versionLabel: label,
  effectiveDate,
  languageCode: 'de',
  sourceUrl: null,
  gazetteReference: null,
  provenance: 'imported',
  verificationState: 'unverified',
  verifiedBy: null,
  verifiedAt: null,
  latestPublished: false,
});

const constitution = (id: string, versions: VersionSummary[]): ConstitutionSummary => ({
  id,
  slug: id,
  title: id,
  versions,
});

describe('orderVersions', () => {
  it('uses canonical effective-date order in selectors', () => {
    const ordered = orderVersions([v('b', 'v2', '1950-01-01'), v('a', 'v1', '1949-05-23')]);
    expect(ordered.map((version) => version.id)).toEqual(['a', 'b']);
  });
});

describe('compareRequestError', () => {
  const gg = constitution('gg', [v('from', '1949', '1949-05-23'), v('mid', '1956', '1956-03-19'), v('to', '2022', '2022-01-01')]);
  const other = constitution('other', [v('x', 'v1', '1800-01-01')]);

  it('rejects the same version before any article fetch', () => {
    expect(compareRequestError([gg], 'from', 'from')).toMatch(/two different versions/);
  });

  it('rejects a backward path before any article fetch', () => {
    expect(compareRequestError([gg], 'to', 'from')).toMatch(/forward path/);
  });

  it('rejects a cross-constitution pair before any article fetch', () => {
    expect(compareRequestError([gg, other], 'from', 'x')).toMatch(/same constitution/);
  });

  it('accepts a forward path on one constitution', () => {
    expect(compareRequestError([gg], 'from', 'to')).toBeNull();
    expect(versionPath(gg.versions, 'from', 'to')?.map((version) => version.id)).toEqual(['from', 'mid', 'to']);
  });
});

describe('netArticleKind', () => {
  it('classifies multi-hop added-then-changed as added from the endpoints', () => {
    expect(
      netArticleKind(undefined, { id: '1', versionId: 'to', articleNumber: '1', title: 'A', sortOrder: 1, body: 'later' }, [
        'added',
        'changed',
      ]),
    ).toBe('added');
  });

  it('classifies changed-then-removed as removed from the endpoints', () => {
    expect(
      netArticleKind(
        { id: '1', versionId: 'from', articleNumber: '1', title: 'A', sortOrder: 1, body: 'old' },
        undefined,
        ['changed', 'removed'],
      ),
    ).toBe('removed');
  });

  it('uses body text when both ends exist', () => {
    expect(
      netArticleKind(
        { id: '1', versionId: 'from', articleNumber: '1', title: 'A', sortOrder: 1, body: 'old' },
        { id: '2', versionId: 'to', articleNumber: '1', title: 'A', sortOrder: 1, body: 'new' },
        [],
      ),
    ).toBe('changed');
  });
});

describe('neighborCompareLinks', () => {
  const versions = [v('a', '1949', '1949-05-23'), v('b', '1956', '1956-03-19'), v('c', '2022', '2022-01-01')];

  it('exposes previous and next compare shortcuts on a middle version', () => {
    const links = neighborCompareLinks('DE', versions, 'b');
    expect(links.previous?.href).toContain('from=a');
    expect(links.previous?.href).toContain('to=b');
    expect(links.next?.href).toContain('from=b');
    expect(links.next?.href).toContain('to=c');
  });
});
