'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import { BookOpen, Info, PanelLeft, Plus } from 'lucide-react';
import { useLocale, useTranslation } from '../components/TranslationProvider';
import { Alert, Badge } from '../components/ui';
import { WorkCollectionFrame, WorkCollectionHeader, WorkCollectionMenu, WorkCollectionMeta, WorkCollectionGroup, WorkCollectionSection, WorkCollectionRow, WorkRowLink, WorkRowAction, WorkCollectionFilters, WorkContextToggle } from '../components/layout/WorkCollection';
import { ui } from '../../lib/messages';
import { inboxUi } from '../../lib/editor-inbox-messages';
import { workflowUi } from '../../lib/workflow-messages';
import { importWorkspaceUi as m } from '../../lib/import-workspace-messages';
import { statusMessage } from '../../lib/ui-labels';
import { emptyImportFilters, filterImportCollection, type ImportCollectionRow } from '../../lib/import-workspace';
import { ImportUpload, ImportUploadContext } from './ImportUpload';
import collection from '../components/layout/WorkCollection.module.css';
import chrome from '../components/layout/PageChrome.module.css';
import styles from './import-workspace.module.css';

type Props = { rows: ImportCollectionRow[]; unavailable: boolean; membershipUnavailable: boolean; canImport: boolean; initialMode?: string; initialError?: string };
export function ImportWorkspace({ rows, unavailable, membershipUnavailable, canImport, initialMode, initialError }: Props) {
  const t = useTranslation(), contextId = useId();
  const [creating, setCreating] = useState(canImport && Boolean(initialMode || initialError));
  const [mode, setMode] = useState(initialMode === 'new' ? 'new' : 'existing');
  const [contextShown, setContextShown] = useState(true);
  function choose(next: boolean, nextMode = mode) {
    setCreating(next); setMode(nextMode);
    const url = new URL(window.location.href); url.searchParams.delete('error');
    if (next) url.searchParams.set('mode', nextMode); else url.searchParams.delete('mode');
    url.hash = '';
    window.history.replaceState(window.history.state, '', url.pathname + url.search);
  }
  function keyTab(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? false : event.key === 'End' ? true : !creating;
    choose(next); document.getElementById(next ? 'imports-tab-new' : 'imports-tab-queue')?.focus();
  }
  return <WorkCollectionFrame header={<WorkCollectionHeader title={t(m.title)} intro={t(m.intro)} />}
    renderMenu={() => <WorkCollectionMenu role="toolbar" label={t(m.tools)}>
      <div className={styles.tabs} role="tablist" aria-label={t(m.tools)}>
        {[false, ...(canImport ? [true] : [])].map(next => <button key={String(next)} type="button" id={next ? 'imports-tab-new' : 'imports-tab-queue'} className={chrome.tool} role="tab" aria-selected={creating === next} aria-controls={next ? 'imports-panel-new' : 'imports-panel-queue'} tabIndex={creating === next ? 0 : -1} onKeyDown={canImport ? keyTab : undefined} onClick={() => choose(next)}>
          {next ? <Plus size={16} aria-hidden="true" /> : <PanelLeft size={16} aria-hidden="true" />}<span>{t(next ? m.create : m.overview)}</span>{!next && !unavailable && !membershipUnavailable ? <span className={collection.count} aria-hidden="true">{rows.length}</span> : null}
        </button>)}
      </div>
      {creating ? <WorkContextToggle shown={contextShown} onToggle={() => setContextShown(!contextShown)} contextId={contextId} labels={{ show: t(inboxUi.showContext), hide: t(inboxUi.hideContext), title: t(m.nextLabel) }} /> : null}
    </WorkCollectionMenu>}>
    <section id="imports-panel-queue" role="tabpanel" aria-labelledby="imports-tab-queue" hidden={creating}>
      {unavailable ? <Alert tone="error">{t(m.unavailable)} <a href="/import">{t(inboxUi.retry)}</a></Alert> : null}
      {membershipUnavailable ? <Alert tone="error">{t(m.membershipUnavailable)}</Alert> : null}
      <ImportsQueue rows={rows} incomplete={unavailable || membershipUnavailable} />
    </section>
    {canImport ? <section id="imports-panel-new" role="tabpanel" aria-labelledby="imports-tab-new" hidden={!creating}>
      <ImportUpload mode={mode} onMode={value => choose(true, value)} context={<ImportUploadContext mode={mode} />} contextId={contextId} contextShown={contextShown} initialError={initialError} />
    </section> : null}
  </WorkCollectionFrame>;
}
function ImportsQueue({ rows, incomplete }: { rows: ImportCollectionRow[]; incomplete: boolean }) {
  const t = useTranslation(), locale = useLocale();
  const [filters, setFilters] = useState(emptyImportFilters), [expanded, setExpanded] = useState(false), [limit, setLimit] = useState(20);
  const visible = filterImportCollection(rows, filters, locale), shown = visible.slice(0, limit);
  const countries = [...new Map(rows.map(row => [row.countryKey, row.country])).entries()].sort((a, b) => a[1].localeCompare(b[1], locale));
  const statuses = [...new Set(rows.map(row => row.status))];
  function patch(next: Partial<typeof filters>) { setFilters({ ...filters, ...next }); setLimit(20); }
  const label = (value: string) => t(value === 'preparing' ? m.preparing : statusMessage(value));
  const active = [
    ...(filters.status ? [{ field: 'status', label: label(filters.status) }] : []),
    ...(filters.country ? [{ field: 'country', label: countries.find(([key]) => key === filters.country)?.[1] ?? filters.country }] : []),
    ...(filters.kind ? [{ field: 'kind', label: t(filters.kind === 'package' ? m.packages : m.single) }] : []),
  ];
  return <>
    <WorkCollectionFilters searchLabel={t(m.search)} placeholder={t(m.placeholder)} query={filters.query} onQuery={query => patch({ query })} clearLabel={t(inboxUi.clearSearch)} filterLabel={t(inboxUi.filters)} expanded={expanded} onExpanded={setExpanded} activeCount={active.length}
      chipsLabel={t(inboxUi.activeFilters)} chips={active.length ? <>{active.map(chip => <button type="button" className={collection.chip} key={chip.field} aria-label={`${t(inboxUi.removeFilter)}: ${chip.label}`} onClick={() => patch({ [chip.field]: '' })}>{chip.label}<span aria-hidden="true">×</span></button>)}<button type="button" className={collection.textButton} onClick={() => setFilters(emptyImportFilters)}>{t(inboxUi.clearAll)}</button></> : null}>
      <div className={collection.filterFields}>
        <label>{t(workflowUi.filterStatus)}<select value={filters.status} onChange={event => patch({ status: event.target.value })}><option value="">{t(workflowUi.allStatuses)}</option>{statuses.map(status => <option value={status} key={status}>{label(status)}</option>)}</select></label>
        <label>{t(m.type)}<select value={filters.kind} onChange={event => patch({ kind: event.target.value })}><option value="">{t(m.all)}</option><option value="job">{t(m.single)}</option><option value="package">{t(m.packages)}</option></select></label>
        <label>{t(inboxUi.country)}<select value={filters.country} onChange={event => patch({ country: event.target.value })}><option value="">{t(inboxUi.allCountries)}</option>{countries.map(([key, country]) => <option key={key} value={key}>{country}</option>)}</select></label>
      </div>
    </WorkCollectionFilters>
    <WorkCollectionMeta summary={incomplete ? <>{visible.length} {t(m.available)}</> : <>{visible.length} {t(m.of)} {rows.length} {t(m.items)}</>} grouping={t(m.grouped)} />
    <div className={collection.countries}>{countries.filter(([key]) => shown.some(row => row.countryKey === key)).map(([key, country]) => <WorkCollectionGroup key={key} title={country}>
      <WorkCollectionSection>{shown.filter(row => row.countryKey === key).map(row => <ImportQueueRow key={row.kind + row.id} row={row} />)}</WorkCollectionSection>
    </WorkCollectionGroup>)}</div>
    {!visible.length ? <div className={styles.empty}><BookOpen size={25} aria-hidden="true" /><h2>{t(incomplete ? inboxUi.incompleteTitle : rows.length ? m.noMatches : ui.admin.import.page.noImportsYet)}</h2>{rows.length ? <><p>{t(m.noMatchesHint)}</p><button type="button" className="btn" onClick={() => setFilters(emptyImportFilters)}>{t(inboxUi.clearAll)}</button></> : null}</div> : null}
    {shown.length < visible.length ? <div className={styles.loadMore}><button type="button" className="btn" onClick={() => setLimit(limit + 20)}>{t(inboxUi.showMore)}</button></div> : null}
    <p className={styles.footnote}><Info size={16} aria-hidden="true" />{t(m.packageNote)}</p>
  </>;
}
function ImportQueueRow({ row }: { row: ImportCollectionRow }) {
  const t = useTranslation();
  const tone = row.status === 'approved' ? 'added' : row.status === 'pending_review' ? 'info' : ['failed', 'rejected'].includes(row.status) ? 'changed' : 'neutral';
  return <WorkCollectionRow icon={row.kind === 'package' ? <PanelLeft size={17} aria-hidden="true" /> : <BookOpen size={17} aria-hidden="true" />}
    title={<WorkRowLink href={row.href}>{row.title}</WorkRowLink>} details={<>{row.period ? <>{row.period} · </> : null}{t(row.kind === 'package' ? m.package : m.single)}</>}
    status={<><Badge tone={tone}>{t(row.status === 'preparing' ? m.preparing : statusMessage(row.status))}</Badge>{row.kind === 'package' && Boolean(row.total) ? <span className={styles.progress}>{row.prepared} {t(m.of)} {row.total} {t(m.versionsReady)}</span> : null}</>}
    actions={<WorkRowAction href={row.href}>{t(row.kind === 'package' ? m.continue : row.status === 'pending_review' ? m.review : m.view)}</WorkRowAction>} />;
}
