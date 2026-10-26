'use client';

import { T, useTranslation } from './TranslationProvider';
import { ui } from '../../lib/messages';
import type { ContentOutline } from '../../lib/api';
import { useMemo, useState } from 'react';
import { Badge } from './ui';
import fieldStyles from './fields.module.css';

type FilterArticle = {
  id: string;
  articleNumber: string;
  title: string;
  kind?: string;
};

type ArticleFilterListProps = {
  articles: FilterArticle[];
  selectedId?: string;
  hrefBase: string;
  draftIds: string[];
  outline?: ContentOutline;
};

export function ArticleFilterList({ articles, selectedId, hrefBase, draftIds, outline }: ArticleFilterListProps) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const draftSet = useMemo(() => new Set(draftIds), [draftIds]);
  const articleLabels = useMemo(() => new Map(articles.map(article => {
    const kind = article.kind ?? 'article';
    const label = outline?.kinds.find(item => item.kindCode === kind)?.displayLabel ?? (kind === 'article' ? t(ui.contentKinds.article) : kind);
    return [article.id, [label, article.articleNumber, article.title].filter(Boolean).join(' ')];
  })), [articles, outline, t]);
  const filterLabel = articles.every(article => (article.kind ?? 'article') === 'article') ? ui.readerDynamic.filterArticles : ui.readerDynamic.filterUnits;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return articles;
    }
    return articles.filter((article) => {
      const haystack = articleLabels.get(article.id)!.toLowerCase();
      return haystack.includes(needle);
    });
  }, [articles, query, articleLabels]);

  return (
    <>
      <input
        className={["field-control", fieldStyles.control].join(' ')}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t(filterLabel)}
        aria-label={t(filterLabel)}
      />
      <ul className="article-list">
        {filtered.map((article) => {
          const href = `${hrefBase}&articleId=${encodeURIComponent(article.id)}`;
          const current = article.id === selectedId;
          return (
            <li key={article.id}>
              <a href={href} aria-current={current ? 'true' : undefined}>
                <span>
                  {articleLabels.get(article.id)}
                </span>
                {draftSet.has(article.id) ? <Badge tone="changed"><T value={ui.components.articlefilterlist.draft} /></Badge> : null}
              </a>
            </li>
          );
        })}
      </ul>
    </>
  );
}
