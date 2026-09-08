'use client';

import { useMemo, useState } from 'react';
import { Badge } from './ui';

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
};

export function ArticleFilterList({ articles, selectedId, hrefBase, draftIds }: ArticleFilterListProps) {
  const [query, setQuery] = useState('');
  const draftSet = useMemo(() => new Set(draftIds), [draftIds]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return articles;
    }
    return articles.filter((article) => {
      const haystack = `art. ${article.articleNumber} ${article.title}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [articles, query]);

  return (
    <>
      <input
        className="field-control"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter articles"
        aria-label="Filter articles"
      />
      <ul className="article-list">
        {filtered.map((article) => {
          const href = `${hrefBase}&articleId=${encodeURIComponent(article.id)}`;
          const current = article.id === selectedId;
          return (
            <li key={article.id}>
              <a href={href} aria-current={current ? 'true' : undefined}>
                <span>
                  Art. {article.articleNumber} {article.title}
                </span>
                {draftSet.has(article.id) ? <Badge tone="changed">draft</Badge> : null}
              </a>
            </li>
          );
        })}
      </ul>
    </>
  );
}
