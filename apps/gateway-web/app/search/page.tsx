import type { Metadata } from 'next';
import { FiltersPanel } from '../components/FiltersPanel';
import { PageMain } from '../components/PageMain';
import { SearchSnippet } from '../components/SearchSnippet';
import { Card, PageHeader, Pager } from '../components/ui';
import {
  ApiUnavailableError,
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

function SearchFilters({
  facets,
  versions,
  country,
  versionId,
  effectiveDate,
}: {
  facets: SearchFacets;
  versions: SearchFacets['versions'];
  country: string;
  versionId: string;
  effectiveDate: string;
}) {
  return (
    <div className="search-filter-fields">
      <fieldset>
        <legend>Country</legend>
        <label>
          <input type="radio" name="country" value="" defaultChecked={!country} /> Any country
        </label>
        {facets.countries.map((facet) => (
          <label key={facet.code}>
            <input type="radio" name="country" value={facet.code} defaultChecked={country === facet.code} />
            {facet.countryName || facet.code} ({facet.count})
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Version</legend>
        <label>
          <input type="radio" name="versionId" value="" defaultChecked={!versionId} /> Any version
        </label>
        {versions.map((facet) => (
          <label key={facet.id}>
            <input type="radio" name="versionId" value={facet.id} defaultChecked={versionId === facet.id} />
            {facet.constitutionTitle} · {facet.label} ({facet.count})
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Effective date</legend>
        <label>
          <input type="radio" name="effectiveDate" value="" defaultChecked={!effectiveDate} /> Any date
        </label>
        {facets.dates.map((facet) => (
          <label key={facet.effectiveDate}>
            <input
              type="radio"
              name="effectiveDate"
              value={facet.effectiveDate}
              defaultChecked={effectiveDate === facet.effectiveDate}
            />
            {facet.effectiveDate} ({facet.count})
          </label>
        ))}
      </fieldset>
    </div>
  );
}

export default async function SearchPage(props: SearchPageProps) {
  const searchParams = await props.searchParams;
  const query = searchParams.q?.trim() ?? '';
  const country = searchParams.country?.trim() ?? '';
  const versionId = searchParams.versionId?.trim() ?? '';
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
      error = e instanceof ApiUnavailableError ? e.message : 'Search is unavailable';
      hits = [];
      total = 0;
    }
  }
  const versions = country
    ? facets.versions.filter((version) => version.countryCode === country || version.id === versionId)
    : facets.versions;
  const urlParams = {
    q: query,
    country: country || undefined,
    versionId: versionId || undefined,
    effectiveDate: effectiveDate || undefined,
  };

  return (
    <PageMain className="wide">
      <PageHeader
        breadcrumbs={[{ href: '/', label: 'Countries' }, { label: 'Search' }]}
        title={query ? `Results for “${query}”` : 'Search'}
      />
      <form className="search-page-form" action="/search" method="get">
        <label htmlFor="search-q" className="flex-grow">
          Keyword
          <input
            id="search-q"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Across published articles"
          />
        </label>
        <button className="btn btn-primary" type="submit">
          Search
        </button>
        <div className="search-layout">
          <FiltersPanel>
            <SearchFilters
              facets={facets}
              versions={versions}
              country={country}
              versionId={versionId}
              effectiveDate={effectiveDate}
            />
            <button className="btn btn-sm" type="submit">
              Apply filters
            </button>
          </FiltersPanel>
          <div>
            {error ? (
              <p role="alert">
                {error}. Browse countries instead while the index is down. <a href="/">Countries</a>
              </p>
            ) : null}
            {!error && query && hits.length === 0 ? <p>No articles match “{query}”.</p> : null}
            {!query ? <p className="lede">Enter a keyword to search published article text.</p> : null}
            <ul className="search-hits">
              {hits.map((hit) => (
                <li key={`${hit.articleId}-${hit.versionId}`}>
                  <Card className="search-hit">
                    <h2 className="card-title">
                      <a
                        href={`/countries/${hit.countryCode}/versions/${hit.versionId}/articles/${hit.articleId}`}
                      >
                        Article {hit.articleNumber} — {hit.title}
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
                    ? { href: searchUrl({ ...urlParams, offset: Math.max(0, offset - limit) }), label: 'Previous' }
                    : undefined
                }
                next={
                  offset + limit < total
                    ? { href: searchUrl({ ...urlParams, offset: offset + limit }), label: 'Next' }
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
