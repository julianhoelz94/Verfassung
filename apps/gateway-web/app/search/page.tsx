import { currentLocale } from '../../lib/server-locale';
import { T } from '../components/TranslationProvider';
import { ui, message } from '../../lib/messages';
import type { Metadata } from 'next';
import Link from 'next/link';
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
        <legend><T value={ui.search.page.country} /></legend>
        <label>
          <input type="radio" name="country" value="" defaultChecked={!country} /> <T value={ui.search.page.anyCountry} />{" "}</label>
        {facets.countries.map((facet) => (
          <label key={facet.code}>
            <input type="radio" name="country" value={facet.code} defaultChecked={country === facet.code} />
            {facet.countryName || facet.code} ({facet.count})
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend><T value={ui.search.page.version} /></legend>
        <label>
          <input type="radio" name="versionId" value="" defaultChecked={!versionId} /> <T value={ui.search.page.anyVersion} />{" "}</label>
        {versions.map((facet) => (
          <label key={facet.id}>
            <input type="radio" name="versionId" value={facet.id} defaultChecked={versionId === facet.id} />
            {facet.constitutionTitle} · {facet.label} ({facet.count})
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend><T value={ui.search.page.effectiveDate} /></legend>
        <label>
          <input type="radio" name="effectiveDate" value="" defaultChecked={!effectiveDate} /> <T value={ui.search.page.anyDate} />{" "}</label>
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
  const locale = await currentLocale();
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
      error = message(locale, ui.errors.searchUnavailable);
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
          <FiltersPanel>
            <SearchFilters
              facets={facets}
              versions={versions}
              country={country}
              versionId={versionId}
              effectiveDate={effectiveDate}
            />
            <button className="btn btn-sm" type="submit">
              <T value={ui.search.page.applyFilters} />{" "}</button>
          </FiltersPanel>
          <div>
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
