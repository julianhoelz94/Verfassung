import { Breadcrumbs } from '../components/Breadcrumbs';
import { PageMain } from '../components/PageMain';
import {
  ApiUnavailableError,
  searchArticles,
  searchFacets,
  type SearchFacets,
  type SearchHit,
} from '../../lib/api';

type SearchPageProps = {
  searchParams: {
    q?: string;
    country?: string;
    versionId?: string;
    effectiveDate?: string;
  };
};

const EMPTY_FACETS: SearchFacets = { countries: [], versions: [], dates: [] };

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const query = searchParams.q?.trim() ?? '';
  const country = searchParams.country?.trim() ?? '';
  const versionId = searchParams.versionId?.trim() ?? '';
  const effectiveDate = searchParams.effectiveDate?.trim() ?? '';
  let hits: SearchHit[] = [];
  let facets: SearchFacets = EMPTY_FACETS;
  let error: string | null = null;
  try {
    facets = (await searchFacets()) ?? EMPTY_FACETS;
  } catch {
    facets = EMPTY_FACETS;
  }
  if (query) {
    try {
      hits =
        (await searchArticles(query, {
          country: country || undefined,
          versionId: versionId || undefined,
          effectiveDate: effectiveDate || undefined,
        })) ?? [];
    } catch (e) {
      error = e instanceof ApiUnavailableError ? e.message : 'Search is unavailable';
      hits = [];
    }
  }
  const versions = country
    ? facets.versions.filter(
        (version) => version.countryCode === country || version.id === versionId,
      )
    : facets.versions;

  return (
    <PageMain>
      <Breadcrumbs items={[{ href: '/', label: 'Countries' }, { label: 'Search' }]} />
      <h1>Search</h1>
      <form className="compare-form" action="/search" method="get">
        <label htmlFor="search-q" style={{ flex: 1, minWidth: 200 }}>
          Keyword
          <input
            id="search-q"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Across published articles"
          />
        </label>
        <label htmlFor="search-country">
          Country
          <select id="search-country" name="country" defaultValue={country}>
            <option value="">Any country</option>
            {facets.countries.map((facet) => (
              <option key={facet.code} value={facet.code}>
                {facet.code} ({facet.count})
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="search-version">
          Version
          <select id="search-version" name="versionId" defaultValue={versionId}>
            <option value="">Any version</option>
            {versions.map((facet) => (
              <option key={facet.id} value={facet.id}>
                {facet.constitutionTitle} · {facet.label}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="search-date">
          Effective date
          <select id="search-date" name="effectiveDate" defaultValue={effectiveDate}>
            <option value="">Any date</option>
            {facets.dates.map((facet) => (
              <option key={facet.effectiveDate} value={facet.effectiveDate}>
                {facet.effectiveDate}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Search</button>
      </form>
      {error ? (
        <p role="alert">
          {error}. Browse countries instead while the index is down.{' '}
          <a href="/">Countries</a>
        </p>
      ) : null}
      {!error && query && hits.length === 0 ? <p>No articles match “{query}”.</p> : null}
      {!query ? <p className="lede">Enter a keyword to search published article text.</p> : null}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {hits.map((hit) => (
          <li key={`${hit.articleId}-${hit.versionId}`} style={{ marginBottom: 16 }}>
            <a
              href={`/countries/${hit.countryCode}/versions/${hit.versionId}/articles/${hit.articleId}`}
            >
              Article {hit.articleNumber} — {hit.title}
            </a>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              {hit.constitutionTitle} · {hit.versionLabel}
              {hit.effectiveDate ? ` (${hit.effectiveDate})` : ''} · {hit.countryCode}
            </p>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              {hit.snippet}
            </p>
          </li>
        ))}
      </ul>
    </PageMain>
  );
}
