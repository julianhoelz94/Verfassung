import { currentLocale } from '../../lib/server-locale';
import { T } from '../components/TranslationProvider';
import { ui, message } from '../../lib/messages';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchFilters } from '../components/SearchFilters';
import { usability } from '../../lib/usability-messages';
import { FiltersPanel } from '../components/FiltersPanel';
import { PageMain } from '../components/PageMain';
import { SearchSnippet } from '../components/SearchSnippet';
import { Card, PageHeader, Pager } from '../components/ui';
import {
  searchArticles,
  searchFacets,
  type SearchFacets,
  type SearchHit,
} from '../../lib/api';
import { FormattedDate } from '../../lib/format-date';
import { atlasTitle, metaDescription, pageMetadata } from '../../lib/page-meta';
import { SEARCH_PAGE_SIZE, parseSearchOffset, searchUrl } from '../../lib/search-url';

type SearchPageProps = {
  searchParams: Promise<{
    q?: string;
    country?: string;
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

export default async function SearchPage(props: SearchPageProps) {
  const locale = await currentLocale();
  const searchParams = await props.searchParams;
  const query = searchParams.q?.trim() ?? '';
  const country = searchParams.country?.trim() ?? '';
  const requestedVersion = searchParams.versionId?.trim() ?? '';
  let versionId = requestedVersion;
  const effectiveDate = searchParams.effectiveDate?.trim() ?? '';
  const offset = parseSearchOffset(searchParams.offset);
  let hits: SearchHit[] = [];
  let total = 0;
  let limit = SEARCH_PAGE_SIZE;
  let facets: SearchFacets = EMPTY_FACETS;
  let error: string | null = null;
  try {
    facets = (await searchFacets()) ?? EMPTY_FACETS;
  } catch {
    facets = EMPTY_FACETS;
  }
  const selectedVersion = facets.versions.find(version => version.id === requestedVersion);
  if (country && selectedVersion && selectedVersion.countryCode !== country) versionId = '';
  if (query) {
    try {
      const page = await searchArticles(query, {
        country: country || undefined,
        versionId: versionId || undefined,
        effectiveDate: effectiveDate || undefined,
        limit: SEARCH_PAGE_SIZE,
        offset,
      });
      hits = page?.hits ?? [];
      total = page?.total ?? 0;
      limit = page?.limit ?? SEARCH_PAGE_SIZE;
    } catch (e) {
      error = message(locale, ui.errors.searchUnavailable);
      hits = [];
      total = 0;
    }
  }
  const urlParams = {
    q: query,
    country: country || undefined,
    versionId: versionId || undefined,
    effectiveDate: effectiveDate || undefined,
  };

  const activeFilters = [
    ...(country ? [{ key: 'country' as const, label: facets.countries.find(facet => facet.code === country)?.countryName || country }] : []),
    ...(versionId ? [{ key: 'versionId' as const, label: selectedVersion ? `${selectedVersion.constitutionTitle} · ${selectedVersion.label}` : versionId }] : []),
    ...(effectiveDate ? [{ key: 'effectiveDate' as const, label: effectiveDate }] : []),
  ];

  return (
    <PageMain className="wide">
      <PageHeader
        breadcrumbs={[{ href: '/', label: message(locale, ui.nav.countries) }, { label: message(locale, ui.remainingStatus.search) }]}
        title={query ? `${message(locale, ui.remainingStatus.resultsFor)} “${query}”` : message(locale, ui.remainingStatus.search)}
      />
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
        <div className="search-layout">
          <FiltersPanel count={activeFilters.length}>
            <SearchFilters
              key={`${country}:${versionId}:${effectiveDate}`}
              facets={facets}
              country={country}
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
            {requestedVersion && !versionId ? <p role="status"><T value={usability.countryChanged} /></p> : null}
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
                        href={`/countries/${hit.countryCode}/versions/${hit.versionId}/articles/${hit.articleId}`}
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
                      · {hit.countryCode}
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
        </div>
      </form>
    </PageMain>
  );
}
