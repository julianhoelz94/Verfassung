import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getCountry, getUnit, getVersion } from '../../../../../../../lib/api';
import { atlasTitle, metaDescription, pageMetadata } from '../../../../../../../lib/page-meta';
import { publicSnapshotContext } from '../../../../../../../lib/reading';
import { CountryConstitutionReader } from '../../CountryConstitutionReader';
import { ReaderPage } from '../../../../../../components/layout/templates';
import { ServiceUnavailable } from '../../../../../../components/StatusMessage';
import { ui } from '../../../../../../../lib/messages';

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
  const { code, versionId, articleId } = await props.params;
  const { error } = await props.searchParams;
  let article;
  try { article = await getUnit(versionId, articleId); }
  catch { return <ReaderPage width="content"><ServiceUnavailable service={ui.services.content} retryHref={`/countries/${code}/versions/${versionId}/articles/${articleId}`} /></ReaderPage>; }
  if (!article || article.versionId !== versionId) notFound();
  return CountryConstitutionReader({ code, versionId, error,
    initialPassage: { id: article.id, legacyId: `article-${article.articleNumber}` } });
}
