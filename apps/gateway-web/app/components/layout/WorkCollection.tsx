"use client";

import { useId, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Filter, PanelRight, Search, X } from 'lucide-react';
import { FullWidthPage, PageChromeSurface, PageMenuBar, PageMenuFrame } from './PageChrome';
import { usePageChromeMetrics } from './usePageChromeMetrics';
import chrome from './PageChrome.module.css';
import styles from './WorkCollection.module.css';

export type ContextLabels = { show: string; hide: string; title: string };
/** Shared presentation; navigation, workflow commands and data stay with each owner. */
export function WorkCollectionFrame({ header, breadcrumbs, renderMenu, children, context, contextLabels, compact = false, template = 'collection', className, ...props }: Omit<ComponentPropsWithoutRef<'main'>, 'title'> & {
  header: ReactNode; breadcrumbs?: ReactNode; renderMenu: (contextToggle: ReactNode) => ReactNode;
  context?: ReactNode; contextLabels?: ContextLabels; compact?: boolean; template?: 'collection' | 'workspace';
}) {
  const root = useRef<HTMLDivElement>(null), menu = useRef<HTMLDivElement>(null), navigation = useRef<HTMLElement>(null);
  usePageChromeMetrics(root, menu, navigation);
  const [shown, setShown] = useState(true), contextId = useId();
  const toggle = context && contextLabels ? <WorkContextToggle shown={shown} onToggle={() => setShown(!shown)} contextId={contextId} labels={contextLabels} /> : null;
  return <FullWidthPage {...props} template={template} className={[styles.page, className].filter(Boolean).join(' ')} data-compact-workspace={compact}>
    <PageChromeSurface ref={root} data-work-collection>
      {breadcrumbs}{header}
      <PageMenuFrame ref={menu} data-work-collection-menu>{renderMenu(toggle)}</PageMenuFrame>
      <div className={styles.body}>
        {context ? <WorkContextLayout context={context} contextId={contextId} shown={shown} label={contextLabels?.title}>{children}</WorkContextLayout> : children}
      </div>
    </PageChromeSurface>
  </FullWidthPage>;
}
export function WorkCollectionHeader({ title, intro, meta, eyebrow, actions, compact, back }: { title: ReactNode; intro?: ReactNode; meta?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode; compact?: boolean; back?: { href: string; label: string } }) {
  if (compact) return <header className={styles.compactHeading}>
    {back ? <a className={styles.compactBack} href={back.href} aria-label={back.label} title={back.label}><ArrowLeft size={18} aria-hidden="true" /></a> : null}
    <div><div className={styles.compactMeta}>{eyebrow ? <span>{eyebrow}</span> : null}{meta}</div><h1>{title}</h1></div>
  </header>;
  return <header className={styles.heading}><div>{eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}<h1>{title}</h1>{intro ? <p>{intro}</p> : null}{meta ? <div className={styles.headingMeta}>{meta}</div> : null}</div>{actions}</header>;
}
export function WorkCollectionMenu({ className, ...props }: Omit<ComponentPropsWithoutRef<typeof PageMenuBar>, 'compact'>) {
  return <PageMenuBar {...props} compact={false} className={[styles.menu, className].filter(Boolean).join(' ')} />;
}
export function WorkContextToggle({ shown, onToggle, contextId, labels }: { shown: boolean; onToggle: () => void; contextId: string; labels: ContextLabels }) {
  const label = shown ? labels.hide : labels.show;
  return <button type="button" className={[chrome.tool, styles.contextToggle].join(' ')} aria-expanded={shown} aria-controls={contextId} aria-label={label} title={label} onClick={onToggle}><PanelRight size={17} aria-hidden="true" /><span>{label}</span></button>;
}
export function WorkContextLayout({ children, context, contextId, shown, label, creation = false }: { children: ReactNode; context: ReactNode; contextId: string; shown: boolean; label?: string; creation?: boolean }) {
  return <div className={styles.focused} data-context={shown} data-creation={creation}>
    <div className={styles.main}>{children}</div>
    <aside id={contextId} className={styles.context} hidden={!shown} aria-label={label}>{context}</aside>
  </div>;
}
export function WorkCollectionFilters({ searchLabel, placeholder, query, onQuery, clearLabel, filterLabel, expanded, onExpanded, activeCount, children, chips, chipsLabel, footer, doneLabel }: {
  searchLabel: string; placeholder: string; query: string; onQuery: (query: string) => void; clearLabel: string;
  filterLabel: string; expanded: boolean; onExpanded: (value: boolean) => void; activeCount: number;
  children: ReactNode; chips?: ReactNode; chipsLabel?: string; footer?: ReactNode; doneLabel?: string;
}) {
  const id = useId(), button = useRef<HTMLButtonElement>(null);
  function close() { onExpanded(false); button.current?.focus(); }
  return <div onKeyDown={event => { if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <div className={styles.searchToolbar}>
      <div className={styles.search}><Search size={18} aria-hidden="true" /><input type="search" maxLength={200} aria-label={searchLabel} placeholder={placeholder} value={query} onChange={event => onQuery(event.target.value)} />{query ? <button type="button" className={styles.iconButton} aria-label={clearLabel} onClick={() => onQuery('')}><X size={16} aria-hidden="true" /></button> : null}</div>
      <button ref={button} type="button" className={['btn', styles.filterButton].join(' ')} aria-label={filterLabel} aria-expanded={expanded} aria-controls={id} onClick={() => onExpanded(!expanded)}><Filter size={17} aria-hidden="true" />{filterLabel}{activeCount ? <span className={styles.count}>{activeCount}</span> : null}<ChevronDown size={14} aria-hidden="true" /></button>
    </div>
    <section className={styles.filters} id={id} hidden={!expanded} aria-label={filterLabel}>{children}{footer || doneLabel ? <div className={styles.filterFooter}>{footer}{doneLabel ? <button type="button" className={styles.textButton} onClick={close}>{doneLabel}<Check size={14} aria-hidden="true" /></button> : null}</div> : null}</section>
    {chips ? <div className={styles.chips} aria-label={chipsLabel}>{chips}</div> : null}
  </div>;
}
export function WorkCollectionMeta({ summary, grouping }: { summary: ReactNode; grouping: ReactNode }) {
  return <div className={styles.listMeta} aria-live="polite"><span>{summary}</span><span>{grouping}</span></div>;
}
export function WorkCollectionGroup({ title, icon, className, children }: { title: ReactNode; icon?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={className}><div className={styles.countryHeading}>{icon}<h2>{title}</h2></div>{children}</section>;
}
export function WorkCollectionSection({ title, meta, className, listClassName, children }: { title?: ReactNode; meta?: ReactNode; className?: string; listClassName?: string; children: ReactNode }) {
  return <section className={[styles.constitution, className].filter(Boolean).join(' ')}>{title ? <div className={styles.constitutionHeading}><h3>{title}</h3>{meta ? <span>{meta}</span> : null}</div> : null}<ul className={[styles.rows, listClassName].filter(Boolean).join(' ')}>{children}</ul></section>;
}
export function WorkCollectionRow({ icon, iconTone, title, details, status, actions, className, ...props }: Omit<ComponentPropsWithoutRef<'li'>, 'title'> & { icon: ReactNode; iconTone?: 'accent' | 'changed' | 'info'; title: ReactNode; details: ReactNode; status: ReactNode; actions: ReactNode }) {
  return <li {...props} className={[styles.row, className].filter(Boolean).join(' ')}><span className={styles.workIcon} data-tone={iconTone}>{icon}</span><div className={styles.rowInfo}>{title}<div className={styles.rowDetails}>{details}</div></div><div className={styles.rowTail}><div className={styles.rowStatus}>{status}</div><div className={styles.rowActions}>{actions}</div></div></li>;
}
export function WorkRowLink({ className, ...props }: ComponentPropsWithoutRef<'a'>) {
  return <a {...props} className={[styles.rowTitle, className].filter(Boolean).join(' ')} />;
}
/** The complete next action moves as a unit rather than splitting a word or arrow. */
export function WorkRowAction({ children, className, ...props }: ComponentPropsWithoutRef<'a'>) {
  return <a {...props} className={[styles.rowAction, className].filter(Boolean).join(' ')}><span>{children}</span><ArrowRight size={15} aria-hidden="true" /></a>;
}
