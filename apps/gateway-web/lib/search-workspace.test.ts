import { describe, expect, it } from 'vitest';
import { readerSearchHref, safeSearchHref, searchHitHref } from './search-workspace';

describe('public search return locations', () => {
  it('canonicalizes the query and retains only exact search criteria and pagination', () => {
    expect(safeSearchHref('/search?offset=20&q=+equal+rights+&country=XA&versionId=original')).toBe('/search?q=equal+rights&country=XA&versionId=original&offset=20');
    expect(safeSearchHref('/search')).toBe('/search');
  });
  it('rejects external, workspace, fragment and ambiguous return destinations', () => {
    for (const href of [null, '', '//evil.test/search', 'https://evil.test/search', '/searching', '/search/../editor', '/search#edit', '/search?command=publish', '/search?q=a&q=b', '/search?fromSearch=/editor', '/search?q=' + 'a'.repeat(8192)]) expect(safeSearchHref(href)).toBeNull();
  });
  it('preserves national article and regional snapshot pins with return queries before fragments', () => {
    const hit = { countryCode: 'XA', versionId: 'original', articleId: 'article-1' };
    expect(searchHitHref(hit)).toBe('/countries/XA/versions/original/articles/article-1');
    const href = searchHitHref({ ...hit, countryCode: '', jurisdictionId: 'historical' }, '/search?q=rights&offset=20')!;
    const url = new URL(href, 'https://atlas.test');
    expect(url.pathname).toBe('/jurisdictions/historical/versions/original');
    expect(url.hash).toBe('#article-1'); expect(url.searchParams.get('fromSearch')).toBe('/search?q=rights&offset=20');
    expect(searchHitHref({ ...hit, countryCode: '' })).toBeUndefined();
    expect(readerSearchHref('/countries/XA/versions/original#paragraph', '/editor')).toBe('/countries/XA/versions/original#paragraph');
  });
});
