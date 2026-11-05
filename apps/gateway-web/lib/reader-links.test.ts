import { describe, expect, it } from 'vitest';
import { passageReaderHref } from './reader-links';

describe('reader passage destinations', () => {
  it('pins a national citation to its original snapshot and exact nested occurrence', () => {
    expect(passageReaderHref({ countryCode: 'DE', jurisdictionId: 'national-owner' }, 'historical-snapshot', 'article-root', 'sentence-occurrence'))
      .toBe('/countries/DE/versions/historical-snapshot#sentence-occurrence');
  });

  it('opens regional and historical jurisdictions without inventing a country code', () => {
    expect(passageReaderHref({ countryCode: null, jurisdictionId: 'historical-region' }, 'snapshot', 'root', 'parent-text'))
      .toBe('/jurisdictions/historical-region/versions/snapshot#parent-text');
  });

  it('targets the root when no nested occurrence is supplied and escapes path and fragment data', () => {
    expect(passageReaderHref({ code: 'DE' }, 'snapshot/one', 'root#one'))
      .toBe('/countries/DE/versions/snapshot%2Fone#root%23one');
  });

  it('does not invent a link when the owning location is unavailable', () => {
    expect(passageReaderHref(null, 'snapshot', 'root')).toBeUndefined();
    expect(passageReaderHref({}, 'snapshot', 'root')).toBeUndefined();
  });
});
