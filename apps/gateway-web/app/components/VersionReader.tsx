'use client';

import { cloneElement, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ArticleSummary, ContentOutline, OrderedNode } from '../../lib/api';
import { orderedTargets } from '../../lib/ordered-content';
import { linkifyReferences } from '../../lib/crossrefs';
import { articleHeading, clipNodes, clipOrderedEntries, depthStopCount, depthStopLabels } from '../../lib/outline';
import { footnoteBacklinks, footnoteEntries, footnoteItems, type FootnoteItem } from '../../lib/footnotes';
import { readerPresentation, readReaderPreferences, type ReaderPreferences, type ReaderPublication } from '../../lib/reader';
import { readerPreferenceSnapshot, serverReaderPreferenceSnapshot, subscribeReaderPreferences, saveReaderPreferences } from '../../lib/reader-preferences';
import { clearReaderHighlights, findReaderText, highlightReaderMatches, type ReaderMatch } from '../../lib/reader-search';
import { readerUi as copy } from '../../lib/reader-messages';
import { ui } from '../../lib/messages';
import { changeTypeMessage, changeTypeTone } from '../../lib/ui-labels';
import { T, useTranslation } from './TranslationProvider';
import { ConstitutionText, OrderedContentTree, type OrderedNodeElement } from './ConstitutionText';
import { FootnoteProvider } from './Footnotes';
import { Badge } from './ui';
import { ReaderComparison } from './ReaderComparison';
import { ReaderIcon, type ReaderIconName } from './ReaderIcon';
import { ReaderArticle } from './ReaderArticle';
import styles from './VersionReader.module.css';

export type ReaderContext = {
  constitutionId: string; title: string; jurisdictionName: string; versionLabel: string;
  publications: ReaderPublication[]; overviewHref?: string; comparisonHref?: string;
  wikiState?: 'published' | 'empty' | 'unavailable'; editWikiHref?: string;
};
export type VersionReaderProps = {
  code?: string; jurisdictionId?: string; versionId: string; articles: ArticleSummary[];
  outline?: ContentOutline; canEditTitles?: boolean; language?: string;
  changeByArticle?: Record<string, string>; unchangedSinceLabel?: string; initialDepth?: 'summary' | 'full';
  context?: ReaderContext; breadcrumbs?: ReactNode; wiki?: ReactNode; details?: ReactNode;
  editorial?: ReactNode; notices?: ReactNode; footer?: ReactNode;
};

export function VersionReader(props: VersionReaderProps) {
  const entries = useMemo(() => props.articles.flatMap(article => article.content ?? []), [props.articles]);
  const notes = useMemo(() => footnoteItems(entries), [entries]);
  const endnotes = useMemo(() => footnoteEntries(entries), [entries]);
  const backlinks = useMemo(() => footnoteBacklinks(entries), [entries]);
  return <FootnoteProvider notes={notes}><ReaderSurface {...props} notes={notes} endnotes={endnotes} backlinks={backlinks} /></FootnoteProvider>;
}

function ReaderSurface({ code, jurisdictionId, versionId, articles, outline, canEditTitles = false, language,
  changeByArticle = {}, unchangedSinceLabel, initialDepth = 'full', context, breadcrumbs, wiki, details, editorial,
  notices, footer, notes, endnotes, backlinks }: VersionReaderProps & {
    notes: FootnoteItem[]; endnotes: ReturnType<typeof footnoteEntries>; backlinks: ReturnType<typeof footnoteBacklinks>;
  }) {
  const t = useTranslation();
  const viewer = useRef<HTMLDivElement>(null), sticky = useRef<HTMLDivElement>(null), documentRef = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null), navigation = useRef<HTMLElement>(null);
  const savedPreferences = useSyncExternalStore(subscribeReaderPreferences, readerPreferenceSnapshot, serverReaderPreferenceSnapshot);
  const preferences = useMemo(() => { try { return readReaderPreferences(JSON.parse(savedPreferences)); } catch { return readReaderPreferences(null); } }, [savedPreferences]);
  const [panel, setPanel] = useState<'search' | 'compare' | 'wiki' | 'edit' | null>(null);
  const [menu, setMenu] = useState<'details' | 'preferences' | null>(null);
  const [query, setQuery] = useState(''), [matchCount, setMatchCount] = useState(0), [matchIndex, setMatchIndex] = useState(0);
  const matches = useRef<ReaderMatch[]>([]), anchor = useRef<{ element: HTMLElement; top: number } | null>(null);
  const shownOutline = useMemo(() => readerPresentation(outline, preferences.presentation), [outline, preferences.presentation]);
  const max = depthStopCount(outline), labels = depthStopLabels(outline).map((label, i) => i === 0 ? t(ui.readerDynamic.overview) : i === max - 1 ? t(ui.readerDynamic.fullText) : label);
  const [depth, setDepth] = useState(initialDepth === 'summary' ? 1 : max);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [current, setCurrent] = useState(articles[0]?.id ?? '');
  const [stickyHeight, setStickyHeight] = useState(54);
  const unitsByLogicalId = useMemo(() => orderedTargets(articles), [articles]);
  const articlesByNumber = useMemo(() => Object.fromEntries(articles.map(article => [article.articleNumber, article.id])), [articles]);
  const sentenceKinds = useMemo(() => new Set(outline?.kinds.filter(kind => kind.segmentation === 'sentence' && !kind.mayHoldChildren).map(kind => kind.kindCode)), [outline]);
  const flowing = preferences.presentation === 'flowing' || (preferences.presentation === 'source' && outline?.kinds.some(kind => sentenceKinds.has(kind.kindCode) && kind.presentation === 'concatenated'));
  function readerHref(id: string) { return jurisdictionId ? `/jurisdictions/${jurisdictionId}/versions/${id}` : `/countries/${code}/versions/${id}`; }

  useLayoutEffect(() => {
    const root = viewer.current, bar = sticky.current, header = document.querySelector<HTMLElement>('.topbar');
    if (!root || !bar) return;
    function measure() {
      root!.style.setProperty('--reader-header-height', (header?.getBoundingClientRect().height ?? 0) + 'px');
      const height = bar!.getBoundingClientRect().height;
      root!.style.setProperty('--reader-sticky-height', height + 'px');
      root!.style.setProperty('--reader-navigation-height', (window.innerWidth <= 680 ? navigation.current?.getBoundingClientRect().height ?? 0 : 0) + 'px');
      setStickyHeight(height);
    }
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(bar); if (navigation.current) observer?.observe(navigation.current); if (header) observer?.observe(header);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  useLayoutEffect(() => {
    const previous = anchor.current; anchor.current = null;
    if (previous?.element.isConnected) window.scrollBy?.(0, previous.element.getBoundingClientRect().top - previous.top);
  }, [preferences]);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setCurrent(visible[0].target.id);
    }, { rootMargin: `-${stickyHeight + 70}px 0px -45% 0px`, threshold: [0, .1, .5] });
    for (const article of articles) { const node = document.getElementById(article.id); if (node) observer.observe(node); }
    return () => observer.disconnect();
  }, [articles, stickyHeight]);
  useEffect(() => {
    const list = navigation.current?.querySelector('nav'), selected = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!preferences.navigation || !list || !selected) return;
    const item = selected.getBoundingClientRect(), area = list.getBoundingClientRect();
    if (item.top < area.top) list.scrollTop += item.top - area.top;
    else if (item.bottom > area.bottom) list.scrollTop += item.bottom - area.bottom;
  }, [current, preferences.navigation]);
  useEffect(() => {
    function reveal() {
      let target: string;
      try { target = decodeURIComponent(location.hash.slice(1)); } catch { return; }
      if (!target) return;
      const article = articles.find(article => target === article.id || target === 'unit-' + article.id || containsOccurrence(article.content ?? [], target));
      if (article) { setCurrent(article.id); setExpanded(old => old.has(article.id) ? old : new Set([...old, article.id])); }
      requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView?.({ block: 'start' }));
    }
    reveal(); window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, [articles]);
  useEffect(() => {
    if (panel === 'search') searchInput.current?.focus({ preventScroll: true });
  }, [panel]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      matches.current = documentRef.current ? findReaderText(documentRef.current, query) : [];
      setMatchCount(matches.current.length); setMatchIndex(0); highlightReaderMatches(matches.current, 0);
    });
    return () => { cancelAnimationFrame(frame); clearReaderHighlights(); };
  }, [query, articles, depth, expanded, shownOutline]);
  useEffect(() => {
    if (!menu && !panel) return;
    function outside(event: PointerEvent) { if (event.target instanceof Element && !event.target.closest('[data-reader-menu]')) setMenu(null); }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      const active = menu ?? panel; setMenu(null); setPanel(null);
      viewer.current?.querySelector<HTMLElement>(`[data-reader-trigger="${active}"]`)?.focus({ preventScroll: true });
    }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [menu, panel]);

  function updatePreferences(update: Partial<ReaderPreferences>) {
    const boundary = sticky.current?.getBoundingClientRect().bottom ?? 0;
    const element = [...(documentRef.current?.querySelectorAll<HTMLElement>('p, [id]') ?? [])].find(node => node.getBoundingClientRect().top >= boundary);
    if (element) anchor.current = { element, top: element.getBoundingClientRect().top };
    saveReaderPreferences({ ...preferences, ...update });
  }
  function togglePanel(next: typeof panel) { setPanel(panel === next ? null : next); setMenu(null); }
  function goMatch(step: number) {
    if (!matches.current.length) return;
    const index = (matchIndex + step + matches.current.length) % matches.current.length;
    setMatchIndex(index); highlightReaderMatches(matches.current, index); matches.current[index].element.scrollIntoView?.({ block: 'center' });
  }
  function tool(name: NonNullable<typeof panel>, icon: ReaderIconName, label: string) {
    return <button type="button" className={styles.tool} aria-label={label} data-reader-trigger={name} aria-expanded={panel === name} aria-controls={panel === name ? 'reader-' + name : undefined} onClick={() => togglePanel(name)}><ReaderIcon name={icon} /><span className={name === 'wiki' ? undefined : styles.toolName}>{label}</span></button>;
  }
  function renderNode(node: OrderedNode, element: OrderedNodeElement) {
    if (sentenceKinds.has(node.kind)) return cloneElement(element, { className: [element.props.className, styles.sentence].filter(Boolean).join(' ') });
    return cloneElement(element, { className: [element.props.className, styles.passageBlock].filter(Boolean).join(' '), children: <>{element.props.children}<a className={styles.passageLink} data-reader-chrome href={'#' + node.occurrenceId} aria-label={t(copy.passage) + ' · ' + (node.label ?? node.title ?? '')}><ReaderIcon name="link" /></a></> });
  }
  return <div className={styles.viewer} ref={viewer} style={{ '--reader-font-size': preferences.size + 'px' } as React.CSSProperties}>
    {breadcrumbs ? <div className={styles.breadcrumbs}>{breadcrumbs}</div> : null}
    <div className={styles.sticky} ref={sticky}>
      <div className={styles.toolbar} role="toolbar" aria-label={t(ui.accessibility.readingOptions)}>
        <button type="button" className={styles.tool} aria-label={t(preferences.navigation ? copy.hideContents : copy.showContents)} aria-expanded={preferences.navigation} aria-controls="reader-contents" onClick={() => updatePreferences({ navigation: !preferences.navigation })}><ReaderIcon name="contents" /><span className={styles.toolName}>{t(copy.contents)}</span></button>
        <span className={styles.divider} aria-hidden="true" />
        {tool('search', 'search', t(copy.find))}
        {context ? tool('compare', 'compare', t(copy.compare)) : null}
        {context ? tool('wiki', 'wiki', t(copy.wiki)) : null}
        <span className={styles.spacer} />
        {editorial ? <button type="button" className={styles.tool} aria-label={t(ui.countries.code.versions.versionid.page.editThisConstitution)} aria-expanded={panel === 'edit'} data-reader-trigger="edit" aria-controls={panel === 'edit' ? 'reader-edit' : undefined} onClick={() => togglePanel('edit')}><ReaderIcon name="edit" /><span className={styles.toolName}>{t(copy.edit)}</span></button> : null}
        {details ? <details className={styles.menuWrap} data-reader-menu open={menu === 'details'}><summary role="button" className={styles.tool} aria-label={t(copy.details)} aria-expanded={menu === 'details'} data-reader-trigger="details" onClick={event => { event.preventDefault(); setMenu(menu === 'details' ? null : 'details'); }}><ReaderIcon name="details" /><span className={styles.toolName}>{t(copy.details)}</span></summary><div className={styles.menu}>{details}</div></details> : null}
        <details className={styles.menuWrap} data-reader-menu open={menu === 'preferences'}><summary role="button" className={styles.tool} aria-label={t(copy.preferences)} aria-expanded={menu === 'preferences'} data-reader-trigger="preferences" onClick={event => { event.preventDefault(); setMenu(menu === 'preferences' ? null : 'preferences'); }}><ReaderIcon name="settings" /></summary>
          <div className={styles.menu}><h2>{t(copy.preferences)}</h2>
            <label>{t(copy.textSize)}<select value={preferences.size} onChange={event => updatePreferences({ size: event.target.value as ReaderPreferences['size'] })}><option value="16">{t(copy.small)}</option><option value="17">{t(copy.standard)}</option><option value="20">{t(copy.large)}</option></select></label>
            {sentenceKinds.size ? <><label>{t(copy.presentation)}<select value={preferences.presentation} onChange={event => updatePreferences({ presentation: event.target.value as ReaderPreferences['presentation'] })}><option value="source">{t(copy.originalLayout)}</option><option value="flowing">{t(copy.flowing)}</option><option value="lines">{t(copy.lines)}</option></select></label>{flowing ? <label className={styles.check}><input type="checkbox" checked={preferences.boundaries} onChange={event => updatePreferences({ boundaries: event.target.checked })} />{t(copy.boundaries)}</label> : null}</> : null}
            <label>{t(copy.detailLevel)}<select aria-label={t(copy.detailLevel)} value={depth} onChange={event => { setDepth(Number(event.target.value)); setExpanded(new Set()); }}>{labels.map((label, i) => <option key={i} value={i + 1}>{label}</option>)}</select></label>
          </div>
        </details>
      </div>
      {panel === 'search' ? <div className={styles.search} id="reader-search"><input type="search" ref={searchInput} aria-label={t(copy.findLabel)} placeholder={t(copy.findPlaceholder)} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); goMatch(event.shiftKey ? -1 : 1); } }} /><output aria-live="polite">{query ? matchCount ? `${matchIndex + 1} ${t(copy.of)} ${matchCount} ${t(copy.matches)}` : t(copy.noMatches) : t(copy.enterQuery)}</output><button type="button" className={styles.tool} aria-label={t(copy.previousMatch)} disabled={!matchCount} onClick={() => goMatch(-1)}><ReaderIcon name="up" /></button><button type="button" className={styles.tool} aria-label={t(copy.nextMatch)} disabled={!matchCount} onClick={() => goMatch(1)}><ReaderIcon name="down" /></button><button type="button" className={styles.tool} aria-label={t(copy.closeSearch)} onClick={() => { setPanel(null); setQuery(''); }}><ReaderIcon name="close" /></button></div> : null}
      {context ? <section id="reader-compare" hidden={panel !== 'compare'} aria-label={t(copy.compareVersions)}><ReaderComparison constitutionId={context.constitutionId} publications={context.publications} viewedVersionId={versionId} readerHref={readerHref} comparisonHref={context.comparisonHref} active={panel === 'compare'} /></section> : null}
      {context && panel === 'wiki' ? <section className={styles.wiki} id="reader-wiki" aria-label={t(copy.wiki)}><div className={styles.wikiHead}><div className={styles.eyebrow}>{t(copy.context)}</div><button type="button" className={styles.tool} aria-label={t(copy.closeWiki)} onClick={() => { setPanel(null); viewer.current?.querySelector<HTMLElement>('[data-reader-trigger="wiki"]')?.focus({ preventScroll: true }); }}><ReaderIcon name="close" /></button></div><h2>{t(copy.about)}</h2><div className={styles.wikiContent}>{wiki ?? <p>{t(context.wikiState === 'unavailable' ? copy.wikiUnavailable : copy.noWiki)}</p>}</div><div className={styles.wikiActions}>{context.overviewHref ? <a href={context.overviewHref}>{t(copy.fullWiki)}</a> : null}{context.editWikiHref ? <a href={context.editWikiHref}>{t(copy.editWiki)}</a> : null}</div></section> : null}
      {panel === 'edit' ? <section className={styles.editorial} id="reader-edit">{editorial}</section> : null}
    </div>
    <div className={styles.layout} data-navigation={preferences.navigation}>
      <aside ref={navigation} className={styles.navigation} hidden={!preferences.navigation} id="reader-contents"><nav className={styles.toc} aria-label={t(copy.contents)}><h2 className={styles.eyebrow}>{t(copy.inConstitution)}</h2><ol>{articles.map(article => <li key={article.id}><a href={'#unit-' + article.id} aria-current={current === article.id ? 'true' : undefined} onClick={() => setCurrent(article.id)}>{articleHeading(outline, { ...article, title: '' }) || articleHeading(outline, article)}{article.title ? <span>{article.title}</span> : null}</a></li>)}</ol>{notes.length ? <><hr /><a href="#reader-footnotes">{t(copy.footnotes)}<span>{notes.length}</span></a></> : null}</nav></aside>
      <section className={styles.main}><div className={styles.document} ref={documentRef} data-boundaries={flowing && preferences.boundaries}>
        <header className={styles.title} data-reader-chrome>{context ? <><div className={styles.eyebrow}>{context.jurisdictionName}</div><h1>{context.title}</h1><p>{context.versionLabel}{language ? ' · ' + language : ''}</p><span className={styles.status}><ReaderIcon name="check" />{t(copy.published)} · {t(copy.readingView)}</span></> : null}{notices}</header>
        <ol className={[styles.articles, 'version-articles'].join(' ')} lang={language}>{articles.map(article => {
          const shown = expanded.has(article.id) ? max : depth, includeText = shown >= max;
          const nodes = clipNodes(article.children ?? [], outline, shown), open = nodes.length > 0 || includeText;
          const permalink = code ? `/countries/${code}/versions/${versionId}/${article.kind && article.kind !== 'article' ? 'units' : 'articles'}/${article.id}#article-${article.articleNumber}` : `/versions/${versionId}/units/${article.id}`;
          return <ReaderArticle id={article.id} key={article.id} heading={articleHeading(outline, article)} label={articleHeading(outline, { ...article, title: '' })} caption={article.title} permalink={permalink} expanded={open} onToggle={depth < max ? () => setExpanded(old => { const next = new Set(old); if (next.has(article.id)) next.delete(article.id); else next.add(article.id); return next; }) : undefined}
            metadata={<><a href={permalink}><T value={ui.components.versionreader.permalink} /></a>{code && article.kind === 'article' ? <a href={`/countries/${code}/articles/${encodeURIComponent(article.articleNumber)}`}><T value={ui.components.versionreader.historyOf} /> {article.articleNumber}</a> : null}{changeByArticle[article.articleNumber] ? <Badge tone={changeTypeTone(changeByArticle[article.articleNumber])}><T value={changeTypeMessage(changeByArticle[article.articleNumber])} /></Badge> : <span>{unchangedSinceLabel ? `${t(ui.readerDynamic.unchangedSince)} ${unchangedSinceLabel}` : t(ui.readerDynamic.unchanged)}</span>}</>}>
            {open ? <div>{article.content != null ? <div className="constitution-text text-column"><OrderedContentTree entries={clipOrderedEntries(article.content, shownOutline, shown)} outline={shownOutline} crossRefs={{ code, versionId, articlesByNumber, unitsByLogicalId, footnotes: notes }} withRefs={value => linkifyReferences(value, { code, versionId, articlesByNumber, kindLabel: outline?.kinds.find(kind => kind.kindCode === 'article')?.displayLabel ?? t(ui.remainingStatus.article) })} hideFootnotes renderNode={renderNode} canEditTitles={canEditTitles} returnTo={readerHref(versionId)} /></div> : <ConstitutionText article={article} nodes={nodes} body={includeText && !nodes.length ? article.body : null} showHeading={false} rootAnchor={false} outline={shownOutline} lang={language} crossRefs={{ code, versionId, articlesByNumber, unitsByLogicalId, footnotes: notes }} />}</div> : null}
          </ReaderArticle>;
        })}</ol>
        {endnotes.length ? <section className={styles.notes} id="reader-footnotes" aria-label={t(copy.footnotes)}><h2>{t(copy.footnotes)}</h2><OrderedContentTree entries={endnotes} outline={outline} indexedBacklinks={backlinks} /></section> : null}
        <footer className={styles.footer} data-reader-chrome>{footer ?? <span>{articles.length} <T value={articles.length === 1 ? ui.remainingStatus.unitSingular : ui.remainingStatus.unitPlural} /></span>}<a className={styles.textAction} href={articles[0] ? '#unit-' + articles[0].id : '#main-content'}><ReaderIcon name="up" />{t(copy.backBeginning)}</a></footer>
      </div></section>
    </div>
  </div>;
}

function containsOccurrence(entries: import('../../lib/api').OrderedEntry[], target: string): boolean {
  return entries.some(entry => entry.occurrenceId === target || 'fn-' + entry.occurrenceId === target ||
    entry.references?.some(reference => 'ref-' + reference.logicalId === target) || Boolean(entry.node && (entry.node.occurrenceId === target || containsOccurrence(entry.node.content, target))));
}
