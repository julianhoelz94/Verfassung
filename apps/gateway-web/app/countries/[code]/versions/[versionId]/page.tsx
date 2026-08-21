import {
  ApiUnavailableError,
  getCountry,
  listArticles,
  type ArticleSummary,
  type CountryDetail,
} from '../../../../../lib/api';

type VersionPageProps = {
  params: { code: string; versionId: string };
};

export default async function VersionPage({ params }: VersionPageProps) {
  let country: CountryDetail | null = null;
  let articles: ArticleSummary[] = [];
  let error: string | null = null;
  try {
    country = await getCountry(params.code);
    articles = (await listArticles(params.versionId)) ?? [];
  } catch (e) {
    error = e instanceof ApiUnavailableError ? e.message : 'A backend service is unavailable';
    country = null;
    articles = [];
  }

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <p>{error}.</p>
      </main>
    );
  }

  const version = country?.constitutions
    .flatMap((c) => c.versions.map((v) => ({ constitution: c, version: v })))
    .find((row) => row.version.id === params.versionId);

  if (!country || !version) {
    return (
      <main style={{ padding: 24 }}>
        <p>Unknown constitution version.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 800 }}>
      <p>
        <a href="/">Countries</a>
        {' · '}
        <a href={`/countries/${country.isoCode}`}>{country.name}</a>
      </p>
      <h1>{version.constitution.title}</h1>
      <p>Version {version.version.versionLabel}</p>
      <ol>
        {articles.map((article) => (
          <li key={article.id}>
            <a
              href={`/countries/${country.isoCode}/versions/${params.versionId}/articles/${article.id}#article-${article.articleNumber}`}
            >
              Article {article.articleNumber}
              {' — '}
              {article.title}
            </a>
          </li>
        ))}
      </ol>
    </main>
  );
}
