import { currentLocale } from '../../lib/server-locale';
import { T } from '../components/TranslationProvider';
import { ui, message } from '../../lib/messages';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchFilters } from '../components/SearchFilters';
import { usability } from '../../lib/usability-messages';
import { FiltersPanel } from '../components/FiltersPanel';
import { CollectionPage, FilterLayout } from '../components/layout/templates';
import { SearchSnippet } from '../components/SearchSnippet';
import { Card, PageHeader, Pager } from '../components/ui';
import {
  searchArticles,
  searchFacets,
  type SearchFacets,
  type SearchFilters as SearchRequestFilters,
  type SearchHit,
} from '../../lib/api';
import { FormattedDate } from '../../lib/format-date';
import { atlasTitle, metaDescription, pageMetadata } from '../../lib/page-meta';
import { SEARCH_PAGE_SIZE, parseSearchOffset, searchUrl } from '../../lib/search-url';
import { migrationUi } from '../../lib/migration-messages';
import { normalizeSearchSelection, type SearchSelection } from '../../lib/search-filters';
import type { Locale } from '../../lib/locale';

type SearchPageProps = {
  searchParams: Promise<{
    q?: string;
    country?: string;
    jurisdictionId?: string;
    versionId?: string;
    effectiveDate?: string;
    offset?: string;
  }>;
};

export async function generateMetadata(props: SearchPageProps): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const query = searchParams.q?.trim() ?? '';
  const title = query ? atlasTitle('Search', query) : atlasTitle('Search');
  return pageMetadata({
    title,
    description: metaDescription(
      query
        ? `Search results for “${query}” across published constitutions.`
        : 'Search published constitutional articles.',
    ),
    path: '/search',
  });
}

const EMPTY_FACETS: SearchFacets = { countries: [], versions: [], dates: [] };

type SearchResults = {
  hits: SearchHit[];
  total: number;
  limit: number;
  error: string | null;
};

/**
 * Loads a normalized query without contacting search for an empty keyword.
 * Failed requests carry a localized error so the page cannot present an outage
 * as a successful empty result or offer pagination for unavailable results.
 */
async function loadSearchResults(query: string, filters: SearchRequestFilters, locale: Locale): Promise<SearchResults> {
  const empty: SearchResults = { hits: [], total: 0, limit: SEARCH_PAGE_SIZE, error: null };
  if (!query) return empty;
  try {
    const page = await searchArticles(query, filters);
    return {
      hits: page?.hits ?? [],
      total: page?.total ?? 0,
      limit: page?.limit ?? SEARCH_PAGE_SIZE,
      error: null,
    };
  } catch {
    return { ...empty, error: message(locale, ui.errors.searchUnavailable) };
  }
}

/**
 * Labels the normalized selection while retaining filters absent from optional
 * facet discovery. These keys also drive removal links, so unknown pinned values
 * remain visible and removable when the facet index is unavailable.
 */
function activeSearchFilters(facets: SearchFacets, selection: SearchSelection & { effectiveDate: string }, locale: Locale) {
  const { country, jurisdictionId, versionId, effectiveDate } = selection;
  const selectedVersion = facets.versions.find(version => version.id === versionId);
  return [
    ...(jurisdictionId ? [{ key: 'jurisdictionId' as const, label: facets.jurisdictions?.find(item => item.id === jurisdictionId)?.name ?? jurisdictionId }] : []),
    ...(country ? [{ key: 'country' as const, label: facets.countries.find(facet => facet.code === country)?.countryName || country }] : []),
    ...(versionId ? [{ key: 'versionId' as const, label: selectedVersion ? `${selectedVersion.constitutionTitle} · ${selectedVersion.label}` : message(locale, usability.unlistedVersion) }] : []),
    ...(effectiveDate ? [{ key: 'effectiveDate' as const, label: effectiveDate }] : []),
  ];
}

export default async function SearchPage(props: SearchPageProps) {
  const locale = await currentLocale();
  const searchParams = await props.searchParams;
  const query = searchParams.q?.trim() ?? '';
  const requestedCountry = searchParams.country?.trim() ?? '';
  const requestedJurisdiction = searchParams.jurisdictionId?.trim() ?? '';
  const requestedVersion = searchParams.versionId?.trim() ?? '';
  const effectiveDate = searchParams.effectiveDate?.trim() ?? '';
  let offset = parseSearchOffset(searchParams.offset);
  let facets: SearchFacets = EMPTY_FACETS;
  try {
    facets = (await searchFacets()) ?? EMPTY_FACETS;
  } catch {
    facets = EMPTY_FACETS;
  }
  const { country, jurisdictionId, versionId } = normalizeSearchSelection(facets, { country: requestedCountry, jurisdictionId: requestedJurisdiction, versionId: requestedVersion });
  const adjusted = country !== requestedCountry || jurisdictionId !== requestedJurisdiction || versionId !== requestedVersion;
  if (adjusted) offset = 0;
  const urlParams = {
    q: query,
    country: country || undefined,
    jurisdictionId: jurisdictionId || undefined,
    versionId: versionId || undefined,
    effectiveDate: effectiveDate || undefined,
  };
  const { hits, total, limit, error } = await loadSearchResults(query, {
    country: urlParams.country,
    jurisdictionId: urlParams.jurisdictionId,
    versionId: urlParams.versionId,
    effectiveDate: urlParams.effectiveDate,
    limit: SEARCH_PAGE_SIZE,
    offset,
  }, locale);
  const activeFilters = activeSearchFilters(facets, { country, jurisdictionId, versionId, effectiveDate }, locale);

  return (
    <CollectionPage width="content" header={<PageHeader
        breadcrumbs={[{ href: '/', label: message(locale, ui.nav.countries) }, { label: message(locale, ui.remainingStatus.search) }]}
        title={query ? `${message(locale, ui.remainingStatus.resultsFor)} “${query}”` : message(locale, ui.remainingStatus.search)}
      />}>

      <form className="search-page-form" action="/search" method="get">
        <label htmlFor="search-q" className="flex-grow">
          <T value={ui.search.page.keyword} />{" "}<input
            id="search-q"
            type="search"
            name="q"
            defaultValue={query}
            placeholder={message(locale, ui.accessibility.acrossPublishedArticles)}
          />
        </label>
        <button className="btn btn-primary" type="submit">
          <T value={ui.search.page.search} />{" "}</button>
        <FilterLayout>
          <FiltersPanel count={activeFilters.length}>
            <SearchFilters
              key={`${country}:${jurisdictionId}:${versionId}:${effectiveDate}`}
              facets={facets}
              country={country}
              jurisdictionId={jurisdictionId}
              versionId={versionId}
              effectiveDate={effectiveDate}
            />
            <button className="btn btn-sm" type="submit">
              <T value={ui.search.page.applyFilters} />{" "}</button>
          </FiltersPanel>
          <div>
            {activeFilters.length ? <nav className="applied-filters" aria-label={message(locale, usability.appliedFilters)}>
              {activeFilters.map(filter => <a key={filter.key} className="chip" href={searchUrl({ ...urlParams, [filter.key]: undefined })} aria-label={`${message(locale, usability.removeFilter)}: ${filter.label}`}>
                {filter.label}<span aria-hidden="true"> ×</span>
              </a>)}
              <a href={searchUrl({ q: query })}><T value={usability.clearFilters} /></a>
            </nav> : null}
            {adjusted ? <p role="status"><T value={usability.filtersAdjusted} /></p> : null}
            {error ? (
              <p role="alert">
                {error}<T value={ui.search.page.browseCountriesInsteadWhileTheIndexIs} />{" "}<Link href="/"><T value={ui.search.page.countries} /></Link>
              </p>
            ) : null}
            {!error && query && hits.length === 0 ? <p><T value={ui.search.page.noArticlesMatch} />{query}”.</p> : null}
            {!query ? <p className="lede"><T value={ui.search.page.enterAKeywordToSearchPublishedArticle} /></p> : null}
            <ul className="search-hits">
              {hits.map((hit) => (
                <li key={`${hit.articleId}-${hit.versionId}`}>
                  <Card className="search-hit">
                    <h2 className="card-title">
                      <a
                        href={hit.countryCode ? `/countries/${hit.countryCode}/versions/${hit.versionId}/articles/${hit.articleId}` : `/jurisdictions/${hit.jurisdictionId}/versions/${hit.versionId}#${hit.articleId}`}
                      >
                        <T value={ui.search.page.article} />{" "}{hit.articleNumber} — {hit.title}
                      </a>
                    </h2>
                    <p className="muted">
                      {hit.constitutionTitle} · {hit.versionLabel}
                      {hit.effectiveDate ? (
                        <>
                          {' · '}
                          <FormattedDate value={hit.effectiveDate} />
                        </>
                      ) : null}{' '}
                      · {hit.jurisdictionName || hit.countryCode}{hit.historical ? <> · <T value={migrationUi.historical} /></> : null}
                    </p>
                    {hit.snippet ? <SearchSnippet snippet={hit.snippet} /> : null}
                  </Card>
                </li>
              ))}
            </ul>
            {!error && (offset > 0 || offset + limit < total) ? (
              <Pager
                previous={
                  offset > 0
                    ? { href: searchUrl({ ...urlParams, offset: Math.max(0, offset - limit) }), label: <T value={ui.remainingStatus.previous} /> }
                    : undefined
                }
                next={
                  offset + limit < total
                    ? { href: searchUrl({ ...urlParams, offset: offset + limit }), label: <T value={ui.remainingStatus.next} /> }
                    : undefined
                }
              />
            ) : null}
          </div>
        </FilterLayout>
      </form>
    </CollectionPage>
  );
}
