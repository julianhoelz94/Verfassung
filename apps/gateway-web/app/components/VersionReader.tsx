'use client';

import { changeTypeMessage, changeTypeTone } from '../../lib/ui-labels';

import { T, useTranslation } from './TranslationProvider';
import { ui } from '../../lib/messages';
import { useEffect, useMemo, useState } from 'react';
import type { ArticleSummary, ContentOutline } from '../../lib/api';
import { orderedTargets } from '../../lib/ordered-content';
import { articleHeading, clipOrderedEntries, clipNodes, depthStopCount, depthStopLabels, kindByCode } from '../../lib/outline';
import { Badge, Toolbar } from './ui';
import { ConstitutionText, OrderedContentTree } from './ConstitutionText';
import { FootnoteProvider } from './Footnotes';
import { footnoteBacklinks, footnoteEntries, footnoteItems } from '../../lib/footnotes';
import { Segmented } from './Segmented';
import { Toc } from './Toc';
import { ReaderLayout } from './layout/templates';

type VersionReaderProps = {
  code?: string;
  jurisdictionId?: string;
  versionId: string;
  articles: ArticleSummary[];
  outline?: ContentOutline;
  canEditTitles?: boolean;
  language?: string;
  changeByArticle?: Record<string, string>;
  unchangedSinceLabel?: string;
  initialDepth?: 'summary' | 'full';
};

export function VersionReader({
  code,
  jurisdictionId,
  versionId,
  articles,
  outline,
  canEditTitles = false,
  language,
  changeByArticle = {},
  unchangedSinceLabel,
  initialDepth = 'summary',
}: VersionReaderProps) {
  const t = useTranslation();
  const readerHref = jurisdictionId ? `/jurisdictions/${jurisdictionId}/versions/${versionId}` : `/countries/${code}/versions/${versionId}`;
  const max = depthStopCount(outline);
  const labels = depthStopLabels(outline).map((label, index) =>
    index === 0 ? t(ui.readerDynamic.overview) : index === max - 1 ? t(ui.readerDynamic.fullText) : label);
  const [depth, setDepth] = useState(initialDepth === 'full' ? max : 1);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const tocItems = useMemo(
    () =>
      articles.map((article) => ({
        id: `unit-${article.id}`,
        href: `#unit-${article.id}`,
        label: articleHeading(outline, article) || t(ui.editorDynamic.unit),
      })),
    [articles, outline, t],
  );
  const articlesByNumber = useMemo(
    () => Object.fromEntries(articles.map((article) => [article.articleNumber, article.id])),
    [articles],
  );
  const unitsByLogicalId = useMemo(() => orderedTargets(articles), [articles]);
  const entries = useMemo(() => articles.flatMap(article => article.content ?? []), [articles]);
  const notes = useMemo(() => footnoteItems(entries), [entries]);
  const endnotes = useMemo(() => footnoteEntries(entries), [entries]);
  const backlinks = useMemo(() => footnoteBacklinks(entries), [entries]);

  useEffect(() => {
    function revealTarget() {
      let target: string;
      try { target = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
      if (!target) return;
      const root = articles.find(article => target === article.id || target === `unit-${article.id}`)?.id ??
        Object.values(unitsByLogicalId).find(unit => unit.occurrenceId === target)?.rootId ??
        articles.find(article => containsOccurrence(article.content ?? [], target))?.id;
      if (root) setExpanded(current => current.has(root) ? current : new Set([...current, root]));
    }
    revealTarget();
    window.addEventListener('hashchange', revealTarget);
    return () => window.removeEventListener('hashchange', revealTarget);
  }, [articles, unitsByLogicalId]);

  useEffect(() => {
    if (!window.location.hash) return;
    const frame = requestAnimationFrame(() => {
      try { document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView?.(); } catch { /* invalid fragment */ }
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded]);

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
    <FootnoteProvider notes={notes}><ReaderLayout navigation={<Toc items={tocItems} landmarkId="toc" />}>
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
            const permalink = code ? `/countries/${code}/versions/${versionId}/${article.kind && article.kind !== 'article' ? 'units' : 'articles'}/${article.id}#article-${article.articleNumber}` : `/versions/${versionId}/units/${article.id}`;
            const historyHref = `/countries/${code}/articles/${encodeURIComponent(article.articleNumber)}`;
            return (
              <li key={article.id} id={article.id} className="version-article article">
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
                    <span data-translate-content>{articleHeading(outline, article) || t(ui.editorDynamic.unit)}</span>
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
                      rootAnchor={false}
                      outline={outline}
                      headingLevel="h2"
                      canEditTitles={canEditTitles}
                      returnTo={readerHref}
                      lang={language}
                      crossRefs={{ code, versionId, articlesByNumber, unitsByLogicalId }}
                      hideFootnotes
                    />
                  </div>
                ) : (
                  <div id={regionId} hidden />
                )}
                <p className="article-foot print-hide">
                  <a href={permalink}><T value={ui.components.versionreader.permalink} /></a>
                  {code && article.kind === 'article' && article.articleNumber ? <a href={historyHref}><T value={ui.components.versionreader.historyOf} />{" "}{kindByCode(outline, article.kind)?.displayLabel ?? t(ui.remainingStatus.article)} {article.articleNumber}</a> : null}
                  {changeType ? (
                    <Badge tone={changeTypeTone(changeType)}>{<T value={changeTypeMessage(changeType)} />}</Badge>
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
        {endnotes.length ? <div className="constitution-text text-column" lang={language}><OrderedContentTree entries={endnotes} outline={outline} indexedBacklinks={backlinks} /></div> : null}
      </section>
    </ReaderLayout></FootnoteProvider>
  );
}

function containsOccurrence(entries: import('../../lib/api').OrderedEntry[], target: string): boolean {
  return entries.some(entry => entry.occurrenceId === target || `fn-${entry.occurrenceId}` === target ||
    entry.references?.some(reference => 'ref-' + reference.logicalId === target) ||
    Boolean(entry.node && (entry.node.occurrenceId === target || containsOccurrence(entry.node.content, target))));
}
