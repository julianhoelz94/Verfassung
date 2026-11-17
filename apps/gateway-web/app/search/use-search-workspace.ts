'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { searchUrl } from '../../lib/search-url';
import { searchHitKey, type SearchCriteria, type SearchPassage, type SearchWorkspaceData } from '../../lib/search-workspace';
import type { SearchHit } from '../../lib/api';
import { rememberSearch, takeSearchPosition } from './search-memory';

export function useSearchWorkspace(data: SearchWorkspaceData) {
  const router = useRouter(), [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(data.query), [criteria, setCriteria] = useState(data.criteria);
  const [filtersOpen, setFiltersOpen] = useState(false), [enhanced, setEnhanced] = useState(false);
  const [selected, setSelected] = useState<SearchHit | null>(null);
  const search = useRef<HTMLInputElement>(null), filterButton = useRef<HTMLButtonElement>(null);
  const previewOrigin = useRef<HTMLElement | null>(null), previewOriginId = useRef('');
  const [cache] = useState(() => new Map<string, SearchPassage>());
  const previousQuery = useRef(data.query), submitted = useRef(data.query);
  const latestRequest = useRef<string | null>(null);
  const href = searchUrl({ q: data.query, ...data.criteria, offset: data.offset });
  const criteriaKey = JSON.stringify(data.criteria);
  useEffect(() => { queueMicrotask(() => setEnhanced(true)); }, []);
  useEffect(() => {
    if (latestRequest.current && data.requestHref !== latestRequest.current) return;
    const previous = previousQuery.current; previousQuery.current = data.query;
    queueMicrotask(() => setDraft(value => value === previous || value === submitted.current ? data.query : value));
  }, [data.query, data.requestHref]);
  useEffect(() => {
    if (latestRequest.current && data.requestHref !== latestRequest.current) return;
    latestRequest.current = null;
    queueMicrotask(() => setCriteria(data.criteria));
  }, [criteriaKey, data.criteria, data.requestHref]);
  useEffect(() => {
    const pop = () => { latestRequest.current = null; setDraft(new URLSearchParams(location.search).get('q') ?? ''); };
    window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop);
  }, []);
  useEffect(() => {
    let live = true, frame = 0, nextFrame = 0;
    const position = takeSearchPosition(href);
    if (position) queueMicrotask(() => {
      if (!live) return;
      setFiltersOpen(position.filtersOpen); setDraft(position.draft);
      setSelected(data.hits.find(hit => searchHitKey(hit) === position.preview) ?? null);
      previewOriginId.current = position.focusId;
      frame = requestAnimationFrame(() => { nextFrame = requestAnimationFrame(() => {
        if (!live) return;
        window.scrollTo(0, position.scroll); document.getElementById(position.focusId)?.focus({ preventScroll: true });
      }); });
    });
    return () => { live = false; cancelAnimationFrame(frame); cancelAnimationFrame(nextFrame); };
  }, [href, data.hits]);
  function navigate(next: SearchCriteria, query = data.query, replace = true) {
    setCriteria(next); setSelected(null);
    const target = searchUrl({ q: query, ...next });
    latestRequest.current = target;
    startTransition(() => replace ? router.replace(target, { scroll: false }) : router.push(target, { scroll: false }));
  }
  function submit(query = draft) { submitted.current = query.trim(); navigate(criteria, submitted.current, false); }
  function savePosition(focusId: string) {
    rememberSearch(href, { focusId, scroll: window.scrollY, filtersOpen, draft, preview: selected ? searchHitKey(selected) : null });
  }
  function openPreview(hit: SearchHit, origin?: HTMLElement) {
    previewOrigin.current = origin ?? document.activeElement as HTMLElement; previewOriginId.current = previewOrigin.current?.id ?? '';
    setSelected(hit);
    requestAnimationFrame(() => document.getElementById('search-preview-close')?.focus({ preventScroll: true }));
  }
  function closePreview() {
    setSelected(null);
    requestAnimationFrame(() => {
      const target = document.getElementById(previewOriginId.current) ?? previewOrigin.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
    });
  }
  function closeFilters() { setFiltersOpen(false); filterButton.current?.focus(); }
  return { data, draft, setDraft, criteria, pending, href, filtersOpen, setFiltersOpen, enhanced, selected, search, filterButton, cache,
    navigate, submit, savePosition, openPreview, closePreview, closeFilters };
}
export type SearchModel = ReturnType<typeof useSearchWorkspace>;
