'use client';

import { useId, useState } from 'react';
import type { ArticleSummary, ContentOutline } from '../../lib/api';
import { articleHeading, clipNodes, depthStopCount, depthStopLabels } from '../../lib/outline';
import { ConstitutionText } from './ConstitutionText';

type VersionReaderProps = {
  code: string;
  versionId: string;
  articles: ArticleSummary[];
  outline?: ContentOutline;
  canEditTitles?: boolean;
};

export function VersionReader({
  code,
  versionId,
  articles,
  outline,
  canEditTitles = false,
}: VersionReaderProps) {
  const sliderId = useId();
  const max = depthStopCount(outline);
  const labels = depthStopLabels(outline);
  const [depth, setDepth] = useState(1);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

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

  return (
    <div className="version-reader">
      <div className="depth-control print-hide">
        <label htmlFor={sliderId}>Detail</label>
        <input
          id={sliderId}
          type="range"
          min={1}
          max={max}
          step={1}
          value={depth}
          aria-valuemin={1}
          aria-valuemax={max}
          aria-valuenow={depth}
          aria-valuetext={labels[depth - 1]}
          onChange={(event) => setDepth(Number(event.target.value))}
        />
        <ol className="depth-ticks">
          {labels.map((label, index) => (
            <li key={label} className={index + 1 === depth ? 'is-current' : undefined}>
              {label}
            </li>
          ))}
        </ol>
        <p className="muted" aria-live="polite">
          {depth >= max
            ? 'Showing the complete text of this version.'
            : `Showing ${labels[depth - 1]?.toLowerCase()}. Press an article to open its full text here.`}
        </p>
      </div>
      <ol className="version-articles">
        {articles.map((article) => {
          const shown = shownDepth(article.id);
          const nodes = clipNodes(article.children ?? [], outline, shown);
          const includeText = shown >= max;
          const body = includeText && nodes.length === 0 ? (article.body ?? null) : null;
          const open = nodes.length > 0 || includeText;
          const fullyOpen = depth >= max || expanded.has(article.id);
          const regionId = `article-panel-${article.id}`;
          const heading = articleHeading(outline, {
            articleNumber: article.articleNumber,
            title: article.title,
            kind: outline?.kinds[0]?.kindCode ?? 'article',
          });
          return (
            <li key={article.id} className="version-article">
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
                  {heading}
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
                  />
                </div>
              ) : (
                <div id={regionId} hidden />
              )}
              <p className="article-permalink print-hide">
                <a
                  href={`/countries/${code}/versions/${versionId}/articles/${article.id}#article-${article.articleNumber}`}
                >
                  Permalink
                </a>
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
