'use client';

import { useMemo, useState } from 'react';
import type { ArticleSummary, ContentOutline } from '../../lib/api';
import { clipNodes, depthStopCount, depthStopLabels } from '../../lib/outline';
import { neighborsOf } from '../../lib/article-nav';
import { Badge, type BadgeTone, Toolbar } from './ui';
import { ArticleNav } from './ArticleNav';
import { ConstitutionText } from './ConstitutionText';
import { Segmented } from './Segmented';
import { Toc } from './Toc';

type VersionReaderProps = {
  code: string;
  versionId: string;
  articles: ArticleSummary[];
  outline?: ContentOutline;
  canEditTitles?: boolean;
  language?: string;
  changeByArticle?: Record<string, string>;
  unchangedSinceLabel?: string;
};

function changeTone(changeType: string): BadgeTone {
  if (changeType === 'added') {
    return 'added';
  }
  if (changeType === 'removed') {
    return 'removed';
  }
  if (changeType === 'changed') {
    return 'changed';
  }
  return 'neutral';
}

export function VersionReader({
  code,
  versionId,
  articles,
  outline,
  canEditTitles = false,
  language,
  changeByArticle = {},
  unchangedSinceLabel,
}: VersionReaderProps) {
  const max = depthStopCount(outline);
  const labels = depthStopLabels(outline);
  const [depth, setDepth] = useState(1);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const tocItems = useMemo(
    () =>
      articles.map((article) => ({
        id: `article-${article.articleNumber}`,
        href: `#article-${article.articleNumber}`,
        label: `Art. ${article.articleNumber} ${article.title}`,
      })),
    [articles],
  );
  const articlesByNumber = useMemo(
    () => Object.fromEntries(articles.map((article) => [article.articleNumber, article.id])),
    [articles],
  );

  function shownDepth(articleId: string): number {
    return expanded.has(articleId) ? max : depth;
  }

  function toggleArticle(articleId: string) {
    if (depth >= max) {
      return;
    }
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(articleId)) {
        next.delete(articleId);
      } else {
        next.add(articleId);
      }
      return next;
    });
  }

  const toc = <Toc items={tocItems} />;

  return (
    <div className="reader">
      <aside className="reader-aside">
        <Toc items={tocItems} landmarkId="toc" />
      </aside>
      <section>
        <Toolbar label="Reading options">
          <details className="toc-mobile">
            <summary className="btn btn-sm toc-button">Contents</summary>
            {toc}
          </details>
          <Segmented
            labels={labels}
            value={depth}
            ariaLabel="Detail level"
            onChange={(next) => {
              setDepth(next);
              setExpanded(new Set());
            }}
          />
          <span className="toolbar-spacer" />
          <span className="muted">
            {articles.length} article{articles.length === 1 ? '' : 's'}
          </span>
        </Toolbar>
        <ol className="version-articles text-column" lang={language}>
          {articles.map((article) => {
            const shown = shownDepth(article.id);
            const nodes = clipNodes(article.children ?? [], outline, shown);
            const includeText = shown >= max;
            const body = includeText && nodes.length === 0 ? (article.body ?? null) : null;
            const open = nodes.length > 0 || includeText;
            const fullyOpen = depth >= max || expanded.has(article.id);
            const regionId = `article-panel-${article.id}`;
            const changeType = changeByArticle[article.articleNumber];
            const permalink = `/countries/${code}/versions/${versionId}/articles/${article.id}#article-${article.articleNumber}`;
            const neighbors = neighborsOf(articles, article.id);
            const historyHref = `/countries/${code}/articles/${encodeURIComponent(article.articleNumber)}`;
            return (
              <li key={article.id} className="version-article article">
                <h2 className="article-head">
                  <button
                    type="button"
                    className="article-toggle"
                    id={`article-${article.articleNumber}`}
                    aria-expanded={fullyOpen}
                    aria-controls={regionId}
                    disabled={depth >= max}
                    onClick={() => toggleArticle(article.id)}
                  >
                    <span className="num">Art. {article.articleNumber}</span>
                    <span>{article.title}</span>
                  </button>
                </h2>
                {open ? (
                  <div id={regionId}>
                    <ConstitutionText
                      nodes={nodes}
                      body={body}
                      showHeading={false}
                      outline={outline}
                      headingLevel="h2"
                      canEditTitles={canEditTitles}
                      returnTo={`/countries/${code}/versions/${versionId}`}
                      lang={language}
                      crossRefs={{ code, versionId, articlesByNumber }}
                    />
                  </div>
                ) : (
                  <div id={regionId} hidden />
                )}
                <p className="article-foot print-hide">
                  <a href={permalink}>Permalink</a>
                  <a href={historyHref}>History of Art. {article.articleNumber}</a>
                  {changeType ? (
                    <Badge tone={changeTone(changeType)}>{changeType}</Badge>
                  ) : (
                    <span className="muted">
                      {unchangedSinceLabel ? `Unchanged since ${unchangedSinceLabel}` : 'Unchanged'}
                    </span>
                  )}
                </p>
                {fullyOpen ? (
                  <ArticleNav
                    previous={
                      neighbors.previous
                        ? {
                            href: `#article-${neighbors.previous.articleNumber}`,
                            label: `Article ${neighbors.previous.articleNumber}`,
                          }
                        : undefined
                    }
                    next={
                      neighbors.next
                        ? {
                            href: `#article-${neighbors.next.articleNumber}`,
                            label: `Article ${neighbors.next.articleNumber}`,
                          }
                        : undefined
                    }
                    tocHref="#toc"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
