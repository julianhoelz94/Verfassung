import { Breadcrumbs } from '../components/Breadcrumbs';
import { ApiUnavailableError, searchArticles, type SearchHit } from '../../lib/api';

type SearchPageProps = {
  searchParams: { q?: string };
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const query = searchParams.q?.trim() ?? '';
  let hits: SearchHit[] = [];
  let error: string | null = null;
  if (query) {
    try {
      hits = (await searchArticles(query)) ?? [];
    } catch (e) {
      error = e instanceof ApiUnavailableError ? e.message : 'Search is unavailable';
      hits = [];
    }
  }

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
              {hit.snippet}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
