import { notFound } from 'next/navigation';
import { Breadcrumbs } from '../../../../../../components/Breadcrumbs';
import { ConstitutionText } from '../../../../../../components/ConstitutionText';
import { PageMain } from '../../../../../../components/PageMain';
import { PrintLink } from '../../../../../../components/PrintLink';
import { Provenance } from '../../../../../../components/Provenance';
import { ServiceUnavailable } from '../../../../../../components/StatusMessage';
import {
  ApiUnavailableError,
  getArticle,
  getCountry,
  type ArticleDetail,
  type CountryDetail,
} from '../../../../../../../lib/api';
import { canVisitEditor } from '../../../../../../../lib/nav';
import { currentUser } from '../../../../../../../lib/session';

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
      <PageMain>
        <ServiceUnavailable service="Content" retryHref={`/countries/${params.code}/versions/${params.versionId}/articles/${params.articleId}`} />
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
  const returnTo = `/countries/${country.isoCode}/versions/${params.versionId}/articles/${article.id}`;

  return (
    <PageMain>
      <Breadcrumbs
        items={[
          { href: '/', label: 'Countries' },
          { href: `/countries/${country.isoCode}`, label: country.name },
          { href: `/countries/${country.isoCode}/versions/${params.versionId}`, label: 'Articles' },
          { label: `Article ${article.articleNumber}` },
        ]}
      />
      <article>
        <div className="actions print-hide">
          <a href={`${permalink}#article-${article.articleNumber}`}>Permalink</a>
          <PrintLink />
        </div>
        {version ? <Provenance version={version} /> : null}
        <ConstitutionText
          article={article}
          nodes={article.children}
          outline={constitution?.contentOutline}
          canEditTitles={canEditTitles}
          returnTo={returnTo}
        />
      </article>
    </PageMain>
  );
}
