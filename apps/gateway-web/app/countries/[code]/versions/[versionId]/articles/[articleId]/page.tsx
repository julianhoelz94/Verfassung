import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArticleNav } from '../../../../../../components/ArticleNav';
import { ConstitutionText } from '../../../../../../components/ConstitutionText';
import { PageMain } from '../../../../../../components/PageMain';
import { PrintLink } from '../../../../../../components/PrintLink';
import { Provenance } from '../../../../../../components/Provenance';
import { ServiceUnavailable } from '../../../../../../components/StatusMessage';
import { Alert, PageHeader } from '../../../../../../components/ui';
import {
  ApiUnavailableError,
  getArticle,
  getCountry,
  listAllArticles,
  type ArticleDetail,
  type ArticleSummary,
  type CountryDetail,
} from '../../../../../../../lib/api';
import { neighborsOf } from '../../../../../../../lib/article-nav';
import { canVisitEditor } from '../../../../../../../lib/nav';
import { atlasTitle, metaDescription, pageMetadata } from '../../../../../../../lib/page-meta';
import { currentUser } from '../../../../../../../lib/session';

type ArticlePageProps = {
  params: Promise<{ code: string; versionId: string; articleId: string }>;
  searchParams: Promise<{ error?: string }>;
};

export async function generateMetadata(props: ArticlePageProps): Promise<Metadata> {
  const params = await props.params;
  try {
    const [country, article] = await Promise.all([getCountry(params.code), getArticle(params.articleId)]);
    const constitution = country?.constitutions.find((item) =>
      item.versions.some((itemVersion) => itemVersion.id === params.versionId),
    );
    const version = constitution?.versions.find((item) => item.id === params.versionId);
    if (!country || !article || article.versionId !== params.versionId || !version) {
      return { title: atlasTitle('Article') };
    }
    return pageMetadata({
      title: atlasTitle(`Article ${article.articleNumber}`, version.versionLabel, country.name),
      description: metaDescription(article.body),
      path: `/countries/${country.isoCode}/versions/${params.versionId}/articles/${article.id}`,
    });
  } catch {
    return { title: atlasTitle('Article') };
  }
}

function articleHref(
  code: string,
  versionId: string,
  articleId: string,
): string {
  return `/countries/${code}/versions/${versionId}/articles/${articleId}`;
}

export default async function ArticlePage(props: ArticlePageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  let country: CountryDetail | null = null;
  let article: ArticleDetail | null = null;
  let siblings: ArticleSummary[] = [];
  let error: string | null = null;
  try {
    country = await getCountry(params.code);
    article = await getArticle(params.articleId);
    siblings = await listAllArticles(params.versionId, false);
  } catch (e) {
    error = e instanceof ApiUnavailableError ? e.message : 'A backend service is unavailable';
    country = null;
    article = null;
  }

  if (error) {
    return (
      <PageMain>
        <ServiceUnavailable
          service="Content"
          retryHref={`/countries/${params.code}/versions/${params.versionId}/articles/${params.articleId}`}
        />
      </PageMain>
    );
  }

  if (!country || !article || article.versionId !== params.versionId) {
    notFound();
  }

  const permalink = `/countries/${country.isoCode}/versions/${params.versionId}/articles/${article.id}`;
  const constitution = country.constitutions.find((item) =>
    item.versions.some((itemVersion) => itemVersion.id === params.versionId),
  );
  const version = constitution?.versions.find((item) => item.id === params.versionId);
  const user = await currentUser();
  const canEditTitles = Boolean(user && canVisitEditor(user.roles));
  const returnTo = permalink;
  const neighbors = neighborsOf(siblings, article.id);
  const articlesByNumber = Object.fromEntries(siblings.map((item) => [item.articleNumber, item.id]));
  const toLink = (item: ArticleSummary) => ({
    href: articleHref(country.isoCode, params.versionId, item.id),
    label: `Article ${item.articleNumber}`,
  });

  return (
    <PageMain>
      <PageHeader
        breadcrumbs={[
          { href: '/', label: 'Countries' },
          { href: `/countries/${country.isoCode}`, label: country.name },
          { href: `/countries/${country.isoCode}/versions/${params.versionId}`, label: 'Articles' },
          { label: `Article ${article.articleNumber}` },
        ]}
        eyebrow={constitution ? `${country.name} · ${constitution.title}` : country.name}
        title={`Article ${article.articleNumber} — ${article.title}`}
        actions={
          <>
            <a className="btn" href={`/countries/${country.isoCode}/articles/${encodeURIComponent(article.articleNumber)}`}>
              History of Article {article.articleNumber}
            </a>
            <a className="btn" href={`${permalink}#article-${article.articleNumber}`}>
              Permalink
            </a>
            <PrintLink />
          </>
        }
      />
      <article id={`article-${article.articleNumber}`}>
        {searchParams.error === 'title' ? (
          <Alert tone="error">The section title could not be saved.</Alert>
        ) : null}
        {version ? <Provenance version={version} /> : null}
        <ConstitutionText
          article={article}
          nodes={article.children}
          outline={constitution?.contentOutline}
          canEditTitles={canEditTitles}
          returnTo={returnTo}
          lang={version?.languageCode}
          showHeading={false}
          crossRefs={{
            code: country.isoCode,
            versionId: params.versionId,
            articlesByNumber,
          }}
        />
        <ArticleNav
          previous={neighbors.previous ? toLink(neighbors.previous) : undefined}
          next={neighbors.next ? toLink(neighbors.next) : undefined}
          tocHref={`/countries/${country.isoCode}/versions/${params.versionId}#toc`}
        />
      </article>
    </PageMain>
  );
}
