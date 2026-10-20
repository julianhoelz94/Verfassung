'use client';

import { T, useTranslation } from './TranslationProvider';
import { ui } from '../../lib/messages';
import { useMemo, useState } from 'react';
import { Badge } from './ui';
import fieldStyles from './fields.module.css';

type FilterArticle = {
  id: string;
  articleNumber: string;
  title: string;
};

type ArticleFilterListProps = {
  articles: FilterArticle[];
  selectedId?: string;
  hrefBase: string;
  draftIds: string[];
  unitLabel?: string;
};

export function ArticleFilterList({ articles, selectedId, hrefBase, draftIds, unitLabel }: ArticleFilterListProps) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const draftSet = useMemo(() => new Set(draftIds), [draftIds]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return articles;
    }
    return articles.filter((article) => {
      const haystack = `${unitLabel ?? 'Art.'} ${article.articleNumber} ${article.title}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [articles, query, unitLabel]);

  return (
    <>
      <input
        className={["field-control", fieldStyles.control].join(' ')}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t(unitLabel ? ui.readerDynamic.filterUnits : ui.readerDynamic.filterArticles)}
        aria-label={t(unitLabel ? ui.readerDynamic.filterUnits : ui.readerDynamic.filterArticles)}
      />
      <ul className="article-list">
        {filtered.map((article) => {
          const href = `${hrefBase}&articleId=${encodeURIComponent(article.id)}`;
          const current = article.id === selectedId;
          return (
            <li key={article.id}>
              <a href={href} aria-current={current ? 'true' : undefined}>
                <span>
                  {unitLabel ?? 'Art.'} {article.articleNumber} {article.title}
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
