import { describe, expect, it } from 'vitest';
import { parseSearchOffset, searchUrl } from './search-url';

describe('searchUrl', () => {
  it('omits empty filters and a zero offset', () => {
    expect(searchUrl({ q: ' dignity ', offset: 0 })).toBe('/search?q=dignity');
  });

  it('preserves country, version, date, and offset', () => {
    expect(
      searchUrl({
        q: 'dignity',
        country: 'DE',
        versionId: 'v1',
        effectiveDate: '2022-12-19',
        offset: 20,
      }),
    ).toBe('/search?q=dignity&country=DE&versionId=v1&effectiveDate=2022-12-19&offset=20');
  });
});

describe('parseSearchOffset', () => {
  it('treats missing and invalid values as 0', () => {
    expect(parseSearchOffset(undefined)).toBe(0);
    expect(parseSearchOffset('nope')).toBe(0);
    expect(parseSearchOffset('-4')).toBe(0);
  });

  it('reads a positive offset', () => {
    expect(parseSearchOffset('20')).toBe(20);
  });
});
