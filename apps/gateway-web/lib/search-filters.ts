import type { SearchFacets, VersionFacet } from './api';

export type SearchSelection = { country: string; jurisdictionId: string; versionId: string };

export function versionMatchesSelection(version: VersionFacet, selection: Pick<SearchSelection, 'country' | 'jurisdictionId'>): boolean {
  return (!selection.country || version.countryCode === selection.country) &&
    (!selection.jurisdictionId || version.jurisdictionId === undefined || version.jurisdictionId === selection.jurisdictionId);
}

/** Jurisdictions select exactly that owner, not its descendants. Unknown facets
 * are retained so an unavailable index never silently broadens a pinned query. */
export function normalizeSearchSelection(facets: SearchFacets, requested: SearchSelection, changed: 'country' | 'jurisdictionId' = 'jurisdictionId'): SearchSelection {
  const selection = { ...requested };
  const jurisdiction = facets.jurisdictions?.find(item => item.id === selection.jurisdictionId);
  if (selection.country && jurisdiction?.countryCode !== undefined && jurisdiction.countryCode !== selection.country) {
    if (changed === 'country') selection.jurisdictionId = '';
    else selection.country = '';
  }
  const version = facets.versions.find(item => item.id === selection.versionId);
  if (version && !versionMatchesSelection(version, selection)) selection.versionId = '';
  return selection;
}
