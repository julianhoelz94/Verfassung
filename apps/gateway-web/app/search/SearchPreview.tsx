'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import type { SearchHit } from '../../lib/api';
import { readerSearchHref, searchHitHref, searchHitKey, type SearchPassage } from '../../lib/search-workspace';
import { searchWorkspaceUi as copy } from '../../lib/search-workspace-messages';
import { snippetParts } from '../../lib/search-snippet';
import { clearReaderHighlights, findReaderText, highlightReaderMatches } from '../../lib/reader-search';
import { ConstitutionDocument } from '../components/ConstitutionDocument';
import { ConstitutionText } from '../components/ConstitutionText';
import { FootnoteProvider } from '../components/Footnotes';
import { useTranslation } from '../components/TranslationProvider';
import styles from './SearchWorkspace.module.css';

function usePassage(hit: SearchHit, cache: Map<string, SearchPassage>) {
  const key = searchHitKey(hit), [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ passage?: SearchPassage; failed?: boolean }>(() => ({ passage: cache.get(key) }));
  useEffect(() => {
    if (cache.has(key)) return;
    const controller = new AbortController();
    fetch('/api/reader/search-preview?' + new URLSearchParams({ versionId: hit.versionId, articleId: hit.articleId }), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Unavailable passage');
        const passage: SearchPassage = await response.json();
        if (passage.versionId !== hit.versionId || passage.article?.id !== hit.articleId || passage.article.versionId !== hit.versionId) throw new Error('Mismatched passage');
        if (controller.signal.aborted) return;
        if (cache.size >= 10) cache.delete(cache.keys().next().value!);
        cache.set(key, passage); setState({ passage });
      }).catch(() => { if (!controller.signal.aborted) setState({ failed: true }); });
    return () => controller.abort();
  }, [key, hit.articleId, hit.versionId, attempt, cache]);
  return { ...state, retry: () => { setState({}); setAttempt(value => value + 1); } };
}

export function SearchPreview({ hit, query, returnTo, cache, onClose, onReader }: {
  hit: SearchHit; query: string; returnTo: string; cache: Map<string, SearchPassage>; onClose: () => void; onReader: () => void;
}) {
  const t = useTranslation(), { passage, failed, retry } = usePassage(hit, cache);
  const pane = useRef<HTMLDivElement>(null);
  usePreviewBounds(pane);
  useEffect(() => {
    function escape(event: KeyboardEvent) { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); onClose(); } }
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);
  const href = passage ? readerSearchHref(passage.readerHref, returnTo) : searchHitHref(hit, returnTo);
  return <div ref={pane} id="search-preview" className={styles.preview} role="dialog" aria-labelledby="search-preview-title"
    onClickCapture={event => { if (event.target instanceof Element && event.target.closest('a')?.getAttribute('href')?.includes('fromSearch=')) onReader(); }}
    onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <header className={styles.previewHeader}><div><span>{t(copy.previewTitle)}</span><h2 id="search-preview-title">{hit.constitutionTitle}</h2><p>{hit.versionLabel}</p></div>
      <button type="button" id="search-preview-close" className={styles.iconButton} aria-label={t(copy.closePreview)} onClick={onClose}><X size={18} aria-hidden="true" /></button>
    </header>
    <div className={styles.previewBody} role="region" aria-label={t(copy.previewText)} tabIndex={0} aria-busy={!passage && !failed}>
      {passage ? <PassageDocument passage={passage} hit={hit} query={query} returnTo={returnTo} /> : failed ? <div className={styles.previewMessage} role="alert"><p>{t(copy.previewUnavailable)}</p><p>{t(copy.previewUnavailableHint)}</p><button type="button" className="btn" onClick={retry}>{t(copy.retry)}</button></div> : <p className={styles.previewMessage} role="status">{t(copy.previewLoading)}</p>}
    </div>
    <footer className={styles.previewFooter}>{href ? <a className="btn btn-primary" href={href}>{t(copy.openReader)}<ArrowRight size={16} aria-hidden="true" /></a> : <span>{t(copy.readerUnavailable)}</span>}<p>{t(copy.retained)}</p></footer>
  </div>;
}

function PassageDocument({ passage, hit, query, returnTo }: { passage: SearchPassage; hit: SearchHit; query: string; returnTo: string }) {
  const text = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const terms = [...new Set(snippetParts(hit.snippet).filter(part => part.mark).map(part => part.text))];
    const matches = text.current ? (terms.length ? terms : [query]).flatMap(term => findReaderText(text.current!, term)) : [];
    highlightReaderMatches(matches, -1);
    return clearReaderHighlights;
  }, [query, hit.snippet, passage]);
  return <FootnoteProvider notes={passage.notes.map(note => ({ ...note, href: readerSearchHref(note.href, returnTo) }))}><ConstitutionDocument ref={text} className={styles.previewDocument}>
    <ConstitutionText article={passage.article} outline={passage.outline ?? undefined} lang={passage.language} headingLevel="h3" rootAnchor={false} />
  </ConstitutionDocument></FootnoteProvider>;
}

/** Keep the footer on screen below the measured shared toolbar, including when filters grow. */
function usePreviewBounds(pane: React.RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const element = pane.current, menu = document.querySelector<HTMLElement>('[data-work-collection-menu]');
    if (!element) return;
    function measure() {
      const viewport = window.visualViewport, height = viewport?.height ?? window.innerHeight;
      const toolbarBottom = Math.max(0, menu?.getBoundingClientRect().bottom ?? 0);
      const top = window.innerWidth <= 899 ? toolbarBottom + 12 : Math.max(toolbarBottom + 16, element!.getBoundingClientRect().top);
      element!.style.setProperty('--preview-available', Math.max(120, height - top - 16) + 'px');
    }
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (menu) observer?.observe(menu);
    window.addEventListener('resize', measure); window.addEventListener('scroll', measure, { passive: true });
    window.visualViewport?.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure); window.visualViewport?.removeEventListener('resize', measure); };
  }, [pane]);
}
