import { describe, expect, it } from 'vitest';
import type { SearchFacets } from './api';
import { normalizeSearchSelection, versionMatchesSelection } from './search-filters';

export const facets: SearchFacets = {
  countries: [{ code: 'DE', countryName: 'Germany', count: 1 }], dates: [],
  jurisdictions: [{ id: 'national', name: 'Germany', countryCode: 'DE', historical: false, count: 1 },
    { id: 'region', name: 'Historical region', countryCode: '', historical: true, count: 1 }],
  versions: [{ id: 'law', label: '2022', constitutionTitle: 'Basic Law', countryCode: 'DE', jurisdictionId: 'national', count: 1 },
    { id: 'charter', label: '1849', constitutionTitle: 'Charter', countryCode: '', jurisdictionId: 'region', count: 1 }],
};

describe('search selection', () => {
  it('clears a different country and version when selecting a regional jurisdiction or loading conflicting query parameters', () => {
    expect(normalizeSearchSelection(facets, { country: 'DE', jurisdictionId: 'region', versionId: 'law' }))
      .toEqual({ country: '', jurisdictionId: 'region', versionId: '' });
  });
  it('clears the former jurisdiction and version when the user selects a different country', () => {
    expect(normalizeSearchSelection(facets, { country: 'DE', jurisdictionId: 'region', versionId: 'charter' }, 'country'))
      .toEqual({ country: 'DE', jurisdictionId: '', versionId: '' });
  });
  it('keeps a compatible country, jurisdiction and exact version together', () => {
    const selection = { country: 'DE', jurisdictionId: 'national', versionId: 'law' };
    expect(normalizeSearchSelection(facets, selection)).toEqual(selection);
    expect(versionMatchesSelection(facets.versions[1], selection)).toBe(false);
  });
  it('retains a pinned query when facets are unavailable rather than silently broadening it', () => {
    const selection = { country: 'DE', jurisdictionId: 'national', versionId: 'retired-snapshot' };
    expect(normalizeSearchSelection({ countries: [], versions: [], dates: [] }, selection)).toEqual(selection);
  });
});
