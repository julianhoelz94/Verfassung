'use client';

import { T, useTranslation } from './TranslationProvider';
import { ui } from '../../lib/messages';
import { useMemo, useState } from 'react';
import type { ArticleSummary, ContentOutline } from '../../lib/api';
import { orderedTargets } from '../../lib/ordered-content';
import { articleHeading, clipOrderedEntries, clipNodes, depthStopCount, depthStopLabels, kindByCode } from '../../lib/outline';
import { Badge, type BadgeTone, Toolbar } from './ui';
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
  const t = useTranslation();
  const max = depthStopCount(outline);
  const labels = depthStopLabels(outline);
  const [depth, setDepth] = useState(1);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const tocItems = useMemo(
    () =>
      articles.map((article) => ({
        id: `unit-${article.id}`,
        href: `#unit-${article.id}`,
        label: articleHeading(outline, article) || 'Unit',
      })),
    [articles, outline],
  );
  const articlesByNumber = useMemo(
    () => Object.fromEntries(articles.map((article) => [article.articleNumber, article.id])),
    [articles],
  );
  const unitsByLogicalId = useMemo(() => orderedTargets(articles), [articles]);

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
        <Toolbar label={t(ui.accessibility.readingOptions)}>
          <details className="toc-mobile">
            <summary className="btn btn-sm toc-button"><T value={ui.components.versionreader.contents} /></summary>
            {toc}
          </details>
          <Segmented
            labels={labels}
            value={depth}
            ariaLabel={t(ui.accessibility.detailLevel)}
            onChange={(next) => {
              setDepth(next);
              setExpanded(new Set());
            }}
          />
          <span className="toolbar-spacer" />
          <span className="muted">
            {articles.length} <T value={articles.length === 1 ? ui.remainingStatus.unitSingular : ui.remainingStatus.unitPlural} />
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
            const permalink = `/countries/${code}/versions/${versionId}/${article.kind && article.kind !== 'article' ? 'units' : 'articles'}/${article.id}#article-${article.articleNumber}`;
            const historyHref = `/countries/${code}/articles/${encodeURIComponent(article.articleNumber)}`;
            return (
              <li key={article.id} className="version-article article">
                <h2 className="article-head">
                  <button
                    type="button"
                    className="article-toggle"
                    id={`unit-${article.id}`}
                    aria-expanded={fullyOpen}
                    aria-controls={regionId}
                    disabled={depth >= max}
                    onClick={() => toggleArticle(article.id)}
                  >
                    <span data-translate-content>{articleHeading(outline, article) || 'Unit'}</span>
                  </button>
                </h2>
                {open ? (
                  <div id={regionId}>
                    <ConstitutionText
                      article={article}
                      entries={article.content == null ? undefined : clipOrderedEntries(article.content, outline, shown)}
                      nodes={nodes}
                      body={body}
                      showHeading={false}
                      outline={outline}
                      headingLevel="h2"
                      canEditTitles={canEditTitles}
                      returnTo={`/countries/${code}/versions/${versionId}`}
                      lang={language}
                      crossRefs={{ code, versionId, articlesByNumber, unitsByLogicalId }}
                    />
                  </div>
                ) : (
                  <div id={regionId} hidden />
                )}
                <p className="article-foot print-hide">
                  <a href={permalink}><T value={ui.components.versionreader.permalink} /></a>
                  {article.kind === 'article' && article.articleNumber ? <a href={historyHref}><T value={ui.components.versionreader.historyOf} />{" "}{kindByCode(outline, article.kind)?.displayLabel ?? t(ui.remainingStatus.article)} {article.articleNumber}</a> : null}
                  {changeType ? (
                    <Badge tone={changeTone(changeType)}>{changeType}</Badge>
                  ) : (
                    <span className="muted">
                      {unchangedSinceLabel ? `${t(ui.readerDynamic.unchangedSince)} ${unchangedSinceLabel}` : t(ui.readerDynamic.unchanged)}
                    </span>
                  )}
                </p>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
