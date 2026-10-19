import { SnapshotNotice } from '../../../../../../components/SnapshotNotice';
import { T } from '../../../../../../components/TranslationProvider';
import { ui } from '../../../../../../../lib/messages';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ConstitutionText } from '../../../../../../components/ConstitutionText';
import { ContentTranslationRegion } from '../../../../../../components/ContentTranslationRegion';
import { PageMain } from '../../../../../../components/PageMain';
import { PrintLink } from '../../../../../../components/PrintLink';
import { Provenance } from '../../../../../../components/Provenance';
import { ServiceUnavailable } from '../../../../../../components/StatusMessage';
import { Alert, PageHeader } from '../../../../../../components/ui';
import {
  ApiUnavailableError,
  getUnit,
  getCountry,
  getReaderOutline,
  getVersion,
  listAllUnits,
  type ArticleDetail,
  type ArticleSummary,
  type CountryDetail,
} from '../../../../../../../lib/api';
import { atlasTitle, metaDescription, pageMetadata } from '../../../../../../../lib/page-meta';
import { orderedTargets } from '../../../../../../../lib/ordered-content';
import { publicSnapshotContext } from '../../../../../../../lib/reading';

type ArticlePageProps = {
  params: Promise<{ code: string; versionId: string; articleId: string }>;
  searchParams: Promise<{ error?: string }>;
};

export async function generateMetadata(props: ArticlePageProps): Promise<Metadata> {
  const params = await props.params;
  try {
    const [country, article, snapshot] = await Promise.all([getCountry(params.code), getUnit(params.versionId, params.articleId), getVersion(params.versionId)]);
    const version = publicSnapshotContext(country, snapshot)?.version;
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

export default async function ArticlePage(props: ArticlePageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  let country: CountryDetail | null = null;
  let article: ArticleDetail | null = null;
  let siblings: ArticleSummary[] = [];
  let error: string | null = null;
  let snapshot: Awaited<ReturnType<typeof getVersion>> = null;
  try {
    [country, snapshot] = await Promise.all([getCountry(params.code), getVersion(params.versionId)]);
    article = await getUnit(params.versionId, params.articleId);
    siblings = await listAllUnits(params.versionId, true);
  } catch (e) {
    error = e instanceof ApiUnavailableError ? e.message : 'A backend service is unavailable';
    country = null;
    article = null;
  }

  if (error) {
    return (
      <PageMain>
        <ServiceUnavailable
          service={ui.services.content}
          retryHref={`/countries/${params.code}/versions/${params.versionId}/articles/${params.articleId}`}
        />
      </PageMain>
    );
  }

  if (!country || !article || article.versionId !== params.versionId) {
    notFound();
  }

  const permalink = `/countries/${country.isoCode}/versions/${params.versionId}/articles/${article.id}`;
  const context = publicSnapshotContext(country, snapshot);
  if (!context) notFound();
  const { constitution, version } = context;
  const returnTo = permalink;
  const articlesByNumber = Object.fromEntries(siblings.map((item) => [item.articleNumber, item.id]));

  const readerOutline = await getReaderOutline(params.versionId);
  return (
    <PageMain>
      <PageHeader
        breadcrumbs={[
          { href: '/', label: <T value={ui.nav.countries} /> },
          { href: `/countries/${country.isoCode}`, label: country.name },
          { href: `/countries/${country.isoCode}/versions/${params.versionId}`, label: <T value={ui.remainingStatus.articles} /> },
          { label: <><T value={ui.contentKinds.article} /> {article.articleNumber}</> },
        ]}
        eyebrow={constitution ? `${country.name} · ${constitution.title}` : country.name}
        title={<><T value={ui.contentKinds.article} /> {article.articleNumber} — {article.title}</>}
        actions={
          <>
            <a className="btn" href={`/countries/${country.isoCode}/articles/${encodeURIComponent(article.articleNumber)}`}>
              <T value={ui.countries.code.versions.versionid.articles.articleid.page.historyOfArticle} />{" "}{article.articleNumber}
            </a>
            <a className="btn" href={`${permalink}#article-${article.articleNumber}`}>
              <T value={ui.countries.code.versions.versionid.articles.articleid.page.permalink} />{" "}</a>
            <PrintLink />
          </>
        }
      />
      <SnapshotNotice code={country.isoCode} viewedId={params.versionId} currentId={version.currentVersionId ?? version.id} />
      <article id={`article-${article.articleNumber}`}>
        {searchParams.error === 'title' ? (
          <Alert tone="error"><T value={ui.countries.code.versions.versionid.articles.articleid.page.theSectionTitleCouldNotBeSaved} /></Alert>
        ) : null}
        {version ? <Provenance version={version} /> : null}
        <ContentTranslationRegion sourceLanguage={version?.languageCode ?? 'en'}>
        <ConstitutionText
          article={article}
          nodes={article.children}
          outline={readerOutline ?? constitution?.contentOutline}
          returnTo={returnTo}
          lang={version?.languageCode}
          showHeading={false}
          crossRefs={{
            code: country.isoCode,
            versionId: params.versionId,
            articlesByNumber,
            unitsByLogicalId: orderedTargets(siblings),
          }}
        />
        </ContentTranslationRegion>
      </article>
    </PageMain>
  );
}
