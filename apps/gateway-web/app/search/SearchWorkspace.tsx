'use client';

import { ArrowRight, Check, ChevronDown, Filter, Info, List, Search, X } from 'lucide-react';
import Link from 'next/link';
import { ui } from '../../lib/messages';
import { usability } from '../../lib/usability-messages';
import { migrationUi } from '../../lib/migration-messages';
import { searchWorkspaceUi as copy } from '../../lib/search-workspace-messages';
import { searchUrl } from '../../lib/search-url';
import { emptySearchCriteria, searchHitHref, searchHitKey, type SearchWorkspaceData } from '../../lib/search-workspace';
import type { SearchHit } from '../../lib/api';
import { FormattedDate } from '../../lib/format-date';
import { HelpTooltip } from '../components/HelpTooltip';
import { SearchFilters } from '../components/SearchFilters';
import { SearchSnippet } from '../components/SearchSnippet';
import { Pager } from '../components/ui';
import { useTranslation } from '../components/TranslationProvider';
import { WorkCollectionFrame, WorkCollectionHeader, WorkCollectionMenu, WorkContextToggle } from '../components/layout/WorkCollection';
import chrome from '../components/layout/PageChrome.module.css';
import styles from './SearchWorkspace.module.css';
import { useSearchWorkspace, type SearchModel } from './use-search-workspace';
import { SearchPreview } from './SearchPreview';

const formId = 'search-workspace-form';

export function SearchWorkspace({ data }: { data: SearchWorkspaceData }) {
  const model = useSearchWorkspace(data), t = useTranslation(), selected = model.selected;
  return <WorkCollectionFrame id="main-content" className={styles.page} data-search-enhanced={model.enhanced}
    onKeyDown={event => { if (event.key === 'Escape' && model.filtersOpen && !event.defaultPrevented) { event.preventDefault(); model.closeFilters(); } }}
    header={<WorkCollectionHeader title={t(copy.title)} intro={t(copy.intro)} />}
    renderMenu={() => <SearchMenu model={model} />}>
    <AppliedFilters model={model} />
    {data.adjusted ? <p role="status">{t(usability.filtersAdjusted)}</p> : null}
    {data.facetsUnavailable ? <p role="status" className={styles.notice}>{t(copy.facetsUnavailable)}</p> : null}
    <div className={styles.workspace} data-preview={Boolean(selected)} aria-busy={model.pending}>
      <section id="search-results" className={styles.results} aria-label={t(copy.results)} tabIndex={-1}>
        <SearchResults model={model} />
      </section>
      {selected ? <SearchPreview key={searchHitKey(selected)} hit={selected} query={data.query} returnTo={model.href}
        cache={model.cache} onClose={model.closePreview} onReader={() => model.savePosition('search-result-' + searchHitKey(selected))} /> : <div id="search-preview" hidden />}
    </div>
  </WorkCollectionFrame>;
}

function SearchMenu({ model }: { model: SearchModel }) {
  const t = useTranslation(), active = Object.values(model.criteria).filter(Boolean).length;
  const { search: searchRef, filterButton: filterButtonRef } = model;
  return <>
    <WorkCollectionMenu label={t(copy.tools)} className={styles.menu}>
      <a className={[chrome.tool, styles.resultsTool].join(' ')} aria-label={t(copy.results)} href="#search-results" onClick={event => { event.preventDefault(); model.closePreview(); requestAnimationFrame(() => document.getElementById('search-results')?.focus()); }}><List size={17} aria-hidden="true" /><span>{t(copy.results)}</span></a>
      <form id={formId} className={['search-page-form', styles.form].join(' ')} action="/search" method="get"
        onSubmit={event => { event.preventDefault(); model.submit(); }}>
        <label className="visually-hidden" htmlFor="search-q">{t(copy.words)}</label>
        <div className={styles.searchField}><Search size={18} aria-hidden="true" /><input ref={searchRef} id="search-q" name="q" type="search" value={model.draft} onChange={event => model.setDraft(event.target.value)} placeholder={t(copy.placeholder)} />
          {model.draft && model.enhanced ? <button type="button" className={styles.iconButton} aria-label={t(copy.clearSearch)} onClick={() => { model.setDraft(''); searchRef.current?.focus(); }}><X size={16} aria-hidden="true" /></button> : null}
        </div>
        <button className={['btn', 'btn-primary', styles.submit].join(' ')} type="submit">{t(ui.search.page.search)}</button>
      </form>
      {model.enhanced ? <button type="button" ref={filterButtonRef} className={[chrome.tool, styles.filterToggle].join(' ')} aria-controls="search-filters" aria-expanded={model.filtersOpen} onClick={() => model.setFiltersOpen(!model.filtersOpen)}>
        <Filter size={17} aria-hidden="true" />{t(usability.filters)}{active ? <span className={styles.count}>{active}</span> : null}<ChevronDown size={14} aria-hidden="true" />
      </button> : null}
      {model.enhanced && dataHasResults(model.data) ? <WorkContextToggle shown={Boolean(model.selected)}
        onToggle={() => model.selected ? model.closePreview() : model.openPreview(model.data.hits[0])}
        contextId="search-preview" labels={{ show: t(copy.showPreview), hide: t(copy.hidePreview), title: t(copy.previewTitle) }} /> : null}
    </WorkCollectionMenu>
    <details id="search-filters" className={styles.filters} open={model.filtersOpen}
      onToggle={event => { if (!model.enhanced) model.setFiltersOpen(event.currentTarget.open); }}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); model.closeFilters(); } }}>
      <summary>{t(usability.filters)}{active ? ' (' + active + ')' : ''}</summary>
      <div className={styles.filterBody}>
        <SearchFilters facets={model.data.facets} {...model.criteria} form={formId} onChange={model.enhanced ? next => model.navigate(next) : undefined} />
        <div className={styles.filterFooter}><span>{model.enhanced ? t(copy.immediate) : t(copy.scopeHelp)}</span>
          {model.enhanced ? <button type="button" className={chrome.tool} onClick={model.closeFilters}>{t(copy.done)}<Check size={15} aria-hidden="true" /></button> : null}
          <noscript><button type="submit" className="btn" form={formId}>{t(ui.search.page.applyFilters)}</button></noscript>
        </div>
      </div>
    </details>
  </>;
}

function dataHasResults(data: SearchWorkspaceData) { return !data.unavailable && data.hits.length > 0; }

function AppliedFilters({ model }: { model: SearchModel }) {
  const t = useTranslation(), { facets } = model.data, { country, jurisdictionId, versionId, effectiveDate } = model.criteria;
  const version = facets.versions.find(item => item.id === versionId);
  const filters = [
    { key: 'jurisdictionId', value: jurisdictionId, label: facets.jurisdictions?.find(item => item.id === jurisdictionId)?.name ?? jurisdictionId },
    { key: 'country', value: country, label: facets.countries.find(item => item.code === country)?.countryName || country },
    { key: 'versionId', value: versionId, label: version ? version.constitutionTitle + ' · ' + version.label : t(usability.unlistedVersion) },
    { key: 'effectiveDate', value: effectiveDate, label: effectiveDate },
  ].filter(item => item.value);
  return <div className={styles.scope}>
    <span className={styles.scopeLabel}>{filters.length ? t(copy.filteredScope) : t(copy.allScope)}
      <HelpTooltip label={t(copy.scopeHelp)}><Info size={15} aria-hidden="true" /></HelpTooltip>
    </span>
    {filters.length ? <nav className={['applied-filters', styles.chips].join(' ')} aria-label={t(usability.appliedFilters)}>
      {filters.map(filter => <a key={filter.key} className="chip" href={searchUrl({ q: model.data.query, ...model.criteria, [filter.key]: '' })}
        aria-label={t(usability.removeFilter) + ': ' + filter.label}
        onClick={event => { event.preventDefault(); model.navigate({ ...model.criteria, [filter.key]: '' }, model.data.query, false); }}>{filter.label}<span aria-hidden="true"> ×</span></a>)}
      <a href={searchUrl({ q: model.data.query })} onClick={event => { event.preventDefault(); model.navigate(emptySearchCriteria, model.data.query, false); }}>{t(usability.clearFilters)}</a>
    </nav> : null}
  </div>;
}

function SearchResults({ model }: { model: SearchModel }) {
  const t = useTranslation(), data = model.data;
  if (!data.query || data.unavailable) return <SearchEmpty model={model} />;
  return <>
    {data.hits.length ? <>
    <div className={styles.resultMeta} aria-live="polite"><p>{data.total} {t(data.total === 1 ? copy.passage : copy.passages)} {t(copy.for)} <strong>“{data.query}”</strong></p><span>{model.pending ? t(copy.searching) : t(copy.ranking)}</span></div>
    <ul className={['search-hits', styles.hits].join(' ')}>{data.hits.map(hit => <SearchResult key={searchHitKey(hit)} hit={hit} model={model} />)}</ul>
    </> : <SearchEmpty model={model} />}
    <Pager previous={data.offset > 0 ? { href: searchUrl({ q: data.query, ...data.criteria, offset: Math.max(0, data.offset - data.limit) }), label: t(ui.remainingStatus.previous) } : undefined}
      next={data.offset + data.limit < data.total ? { href: searchUrl({ q: data.query, ...data.criteria, offset: data.offset + data.limit }), label: t(ui.remainingStatus.next) } : undefined} />
  </>;
}

function SearchResult({ hit, model }: { hit: SearchHit; model: SearchModel }) {
  const t = useTranslation(), id = 'search-result-' + searchHitKey(hit), href = searchHitHref(hit, model.href);
  const country = model.data.facets.countries.find(item => item.code === hit.countryCode)?.countryName || hit.countryCode;
  return <li className={['search-hit', styles.hit].join(' ')} data-selected={searchHitKey(hit) === (model.selected && searchHitKey(model.selected))}>
    <div className={styles.hitScope}>{country}{hit.jurisdictionName && hit.jurisdictionName !== country ? <>{country ? ' / ' : ''}{hit.jurisdictionName}</> : null}
      {hit.historical ? <span className={styles.historical}>{t(migrationUi.historical)}</span> : null}</div>
    <h2>{href ? <a id={id} href={href} onClick={() => model.savePosition(id)}>{t(ui.search.page.article)} {hit.articleNumber}{hit.title ? ' — ' + hit.title : ''}</a> : <span>{t(ui.search.page.article)} {hit.articleNumber} — {hit.title}</span>}</h2>
    <p className={styles.constitution}>{hit.constitutionTitle}</p>
    <SearchSnippet snippet={hit.snippet} />
    <div className={styles.hitFooter}><p>{hit.versionLabel}<span aria-hidden="true"> · </span>{hit.effectiveDate ? <FormattedDate value={hit.effectiveDate} /> : t(copy.noDate)}</p>
      {model.enhanced ? <button id={'search-preview-trigger-' + searchHitKey(hit)} type="button" className={styles.previewAction} aria-controls="search-preview"
        aria-expanded={model.selected != null && searchHitKey(model.selected) === searchHitKey(hit)} onClick={event => model.openPreview(hit, event.currentTarget)}>{t(copy.previewAction)}<ArrowRight size={15} aria-hidden="true" /></button> : null}
    </div>
  </li>;
}

function SearchEmpty({ model }: { model: SearchModel }) {
  const t = useTranslation(), { query, unavailable } = model.data;
  const title = unavailable ? ui.errors.searchUnavailable : query ? copy.noResults : copy.start;
  const hint = unavailable ? copy.outageHint : query ? copy.noResultsHint : copy.startHint;
  const beyondPage = !unavailable && query && model.data.offset > 0 && model.data.total > 0;
  return <div className={styles.empty} role={unavailable ? 'alert' : undefined}>
    <Search size={27} aria-hidden="true" /><h2>{t(beyondPage ? copy.noPage : title)}</h2><p>{t(beyondPage ? copy.noPageHint : hint)}</p>
    <div className={styles.emptyActions}>
      {beyondPage ? <a className="btn" href={searchUrl({ q: query, ...model.data.criteria })}>{t(copy.firstPage)}</a> : null}
      {unavailable ? <><a className="btn" href={model.href}>{t(copy.retry)}</a><Link href="/">{t(ui.search.page.countries)}</Link></> : query ? <>
        <button type="button" className="btn" onClick={() => { model.search.current?.focus(); model.search.current?.select(); }}>{t(copy.changeWords)}</button>
        {Object.values(model.criteria).some(Boolean) ? <a href={searchUrl({ q: query })} onClick={event => { event.preventDefault(); model.navigate(emptySearchCriteria, query, false); }}>{t(copy.clearAll)}</a> : null}
      </> : <>{[copy.example, copy.exampleOther].map(example => <a key={example.en} className={styles.example} href={searchUrl({ q: t(example), ...model.criteria })} onClick={event => { event.preventDefault(); model.setDraft(t(example)); model.submit(t(example)); }}>{t(copy.try)} “{t(example)}”<ArrowRight size={14} aria-hidden="true" /></a>)}</>}
    </div>
  </div>;
}
