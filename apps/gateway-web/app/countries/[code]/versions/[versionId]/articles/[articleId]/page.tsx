import {
  ApiUnavailableError,
  getArticle,
  getCountry,
  type ArticleDetail,
  type CountryDetail,
} from '../../../../../../../lib/api';

type ArticlePageProps = {
  params: { code: string; versionId: string; articleId: string };
};

export default async function ArticlePage({ params }: ArticlePageProps) {
  let country: CountryDetail | null = null;
  let article: ArticleDetail | null = null;
  let error: string | null = null;
  try {
    country = await getCountry(params.code);
    article = await getArticle(params.articleId);
  } catch (e) {
    error = e instanceof ApiUnavailableError ? e.message : 'A backend service is unavailable';
    country = null;
    article = null;
  }

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <p>{error}.</p>
      </main>
    );
  }

  if (!country || !article || article.versionId !== params.versionId) {
    return (
      <main style={{ padding: 24 }}>
        <p>Unknown article.</p>
      </main>
    );
  }

  const permalink = `/countries/${country.isoCode}/versions/${params.versionId}/articles/${article.id}`;

  return (
    <main style={{ padding: 24, maxWidth: 800 }}>
      <p>
        <a href="/">Countries</a>
        {' · '}
        <a href={`/countries/${country.isoCode}`}>{country.name}</a>
        {' · '}
        <a href={`/countries/${country.isoCode}/versions/${params.versionId}`}>Articles</a>
      </p>
      <article>
        <h1 id={`article-${article.articleNumber}`}>
          Article {article.articleNumber}
          {' — '}
          {article.title}
        </h1>
        <p>
          <a href={`${permalink}#article-${article.articleNumber}`}>Permalink</a>
        </p>
        <p>{article.body}</p>
      </article>
    </main>
  );
}
