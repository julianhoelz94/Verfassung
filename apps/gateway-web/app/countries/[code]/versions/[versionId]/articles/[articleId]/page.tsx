import { notFound } from 'next/navigation';
import { Breadcrumbs } from '../../../../../../components/Breadcrumbs';
import { PageMain } from '../../../../../../components/PageMain';
import { ServiceUnavailable } from '../../../../../../components/StatusMessage';
import {
  ApiUnavailableError,
  getArticle,
  getCountry,
  type ArticleDetail,
  type ContentNode,
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
      <PageMain>
        <ServiceUnavailable service="Content" retryHref={`/countries/${params.code}/versions/${params.versionId}/articles/${params.articleId}`} />
      </PageMain>
    );
  }

  if (!country || !article || article.versionId !== params.versionId) {
    notFound();
  }

  const permalink = `/countries/${country.isoCode}/versions/${params.versionId}/articles/${article.id}`;

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
        <h1 id={`article-${article.articleNumber}`}>
          Article {article.articleNumber}
          {' — '}
          {article.title}
        </h1>
        <p>
          <a href={`${permalink}#article-${article.articleNumber}`}>Permalink</a>
        </p>
        {article.children && article.children.length > 0 ? (
          <NodeTree nodes={article.children} />
        ) : (
          <p>{article.body}</p>
        )}
      </article>
    </PageMain>
  );
}

function NodeTree({ nodes }: { nodes: ContentNode[] }) {
  return (
    <div>
      {nodes.map((node) => (
        <section key={node.id} style={{ marginLeft: node.kind === 'article' ? 0 : 16, marginTop: 8 }}>
          {node.label || node.title ? (
            <p style={{ margin: 0, fontWeight: 600 }}>
              {node.kind}
              {node.label ? ` ${node.label}` : ''}
              {node.title ? ` — ${node.title}` : ''}
            </p>
          ) : null}
          {node.body ? <p style={{ margin: '4px 0' }}>{node.body}</p> : null}
          {node.children.length > 0 ? <NodeTree nodes={node.children} /> : null}
        </section>
      ))}
    </div>
  );
}
