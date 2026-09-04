import { Breadcrumbs } from '../components/Breadcrumbs';
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
    <main>
      <Breadcrumbs items={[{ href: '/', label: 'Countries' }, { label: 'Search' }]} />
      <h1>Search</h1>
      <form className="compare-form" action="/search" method="get">
        <label style={{ flex: 1, minWidth: 200 }}>
          Keyword
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Across published articles"
            aria-label="Search articles"
          />
        </label>
        <label>
          Country
          <select name="country" defaultValue={country} aria-label="Filter by country">
            <option value="">Any country</option>
            {facets.countries.map((facet) => (
              <option key={facet.code} value={facet.code}>
                {facet.code} ({facet.count})
              </option>
            ))}
          </select>
        </label>
        <label>
          Version
          <select name="versionId" defaultValue={versionId} aria-label="Filter by version">
            <option value="">Any version</option>
            {versions.map((facet) => (
              <option key={facet.id} value={facet.id}>
                {facet.constitutionTitle} · {facet.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Effective date
          <select name="effectiveDate" defaultValue={effectiveDate} aria-label="Filter by effective date">
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
      {error ? <p>{error}. Browse countries instead while the index is down.</p> : null}
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
    </main>
  );
}
