import { Breadcrumbs } from '../../../../components/Breadcrumbs';
import {
  ApiUnavailableError,
  getCountry,
  listArticlePage,
  type ArticleSummary,
  type CountryDetail,
} from '../../../../../lib/api';
import { orderVersions } from '../../../../../lib/compare';
import { CompareForm } from '../../CompareForm';

type VersionPageProps = {
  params: { code: string; versionId: string };
  searchParams: { page?: string };
};

const PAGE_SIZE = 50;

export default async function VersionPage({ params, searchParams }: VersionPageProps) {
  const page = Math.max(1, Number(searchParams.page ?? '1') || 1);
  const offset = (page - 1) * PAGE_SIZE;
  let country: CountryDetail | null = null;
  let articles: ArticleSummary[] = [];
  let total = 0;
  let error: string | null = null;
  try {
    country = await getCountry(params.code);
    const articlePage = await listArticlePage(params.versionId, offset, PAGE_SIZE);
    articles = articlePage?.items ?? [];
    total = articlePage?.total ?? 0;
  } catch (e) {
    error = e instanceof ApiUnavailableError ? e.message : 'A backend service is unavailable';
    country = null;
    articles = [];
  }

  if (error) {
    return (
      <main>
        <p>{error}.</p>
      </main>
    );
  }

  const version = country?.constitutions
    .flatMap((c) => c.versions.map((v) => ({ constitution: c, version: v })))
    .find((row) => row.version.id === params.versionId);

  if (!country || !version) {
    return (
      <main>
        <p>Unknown constitution version.</p>
      </main>
    );
  }

  const line = orderVersions(version.constitution.versions);
  const later = line.find((item) => item.id !== params.versionId && line.indexOf(item) > line.findIndex((v) => v.id === params.versionId));
  const earlier = [...line].reverse().find((item) => item.id !== params.versionId && line.indexOf(item) < line.findIndex((v) => v.id === params.versionId));

  return (
    <main>
      <Breadcrumbs
        items={[
          { href: '/', label: 'Countries' },
          { href: `/countries/${country.isoCode}`, label: country.name },
          { label: version.version.versionLabel },
        ]}
      />
      <h1>{version.constitution.title}</h1>
      <p>Version {version.version.versionLabel}</p>
      <div className="actions">
        <a href={`/countries/${country.isoCode}/timeline`}>Amendment timeline</a>
        {later ? (
          <a
            href={`/countries/${country.isoCode}/compare?from=${encodeURIComponent(params.versionId)}&to=${encodeURIComponent(later.id)}`}
          >
            Compare with {later.versionLabel}
          </a>
        ) : null}
        {earlier && !later ? (
          <a
            href={`/countries/${country.isoCode}/compare?from=${encodeURIComponent(earlier.id)}&to=${encodeURIComponent(params.versionId)}`}
          >
            Compare with {earlier.versionLabel}
          </a>
        ) : null}
      </div>
      {line.length > 2 ? (
        <CompareForm
          code={country.isoCode}
          versions={line}
          fromId={params.versionId}
          toId={later?.id ?? line[line.length - 1]?.id}
        />
      ) : null}
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
      {total > PAGE_SIZE ? (
        <p>
          {page > 1 ? (
            <a href={`/countries/${country.isoCode}/versions/${params.versionId}?page=${page - 1}`}>Previous</a>
          ) : null}
          {page * PAGE_SIZE < total ? (
            <>
              {page > 1 ? ' · ' : ''}
              <a href={`/countries/${country.isoCode}/versions/${params.versionId}?page=${page + 1}`}>Next</a>
            </>
          ) : null}
        </p>
      ) : null}
    </main>
  );
}
