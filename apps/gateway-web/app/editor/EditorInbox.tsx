'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Check, ChevronDown, Globe2, Import, Inbox, PenLine, Scale, Search, X } from 'lucide-react';
import { useLocale, useTranslation } from '../components/TranslationProvider';
import { Alert, Badge, type BadgeTone } from '../components/ui';
import { HelpTooltip } from '../components/HelpTooltip';
import { ui } from '../../lib/messages';
import { workflowUi } from '../../lib/workflow-messages';
import { inboxUi, inboxKindMessage as kindMessage } from '../../lib/editor-inbox-messages';
import { statusMessage } from '../../lib/ui-labels';
import { workStatuses } from '../../lib/work-filters';
import { emptyInboxFilters, filterInboxRows, inboxHref, normalizedWorkStatus, type InboxFilters, type InboxKind, type InboxQueue, type InboxRow } from '../../lib/editor-inbox';
import { EditorDeskFrame, readInboxMemory, rememberInbox } from './EditorDeskFrame';
import { WorkActions } from './WorkActions';
import styles from './editor-inbox.module.css';
import collection from '../components/layout/WorkCollection.module.css';
import { WorkCollectionFilters, WorkCollectionGroup, WorkCollectionSection, WorkCollectionRow, WorkCollectionMeta, WorkRowAction, WorkRowLink } from '../components/layout/WorkCollection';

type Props = {
  userId: string; roles: string[]; queue: InboxQueue; initialFilters: InboxFilters;
  rows: InboxRow[]; counts: Partial<Record<InboxQueue, number | null>>;
  sessionsUnavailable: boolean; importsUnavailable: boolean; error?: string | null;
};
const rowKey = (row: InboxRow) => `${row.kind === 'import' ? 'import' : 'session'}:${row.id}`;
function statusTone(status: string): BadgeTone {
  return status === 'open' ? 'accent' : status === 'approved' ? 'info' : status === 'published' ? 'neutral' : ['failed', 'rejected'].includes(status) ? 'removed' : 'changed';
}
function useInbox(props: Props) {
  const t = useTranslation(), locale = useLocale();
  const [restoring, setRestoring] = useState<{ scroll: number; focusId: string; limit?: number } | null>(null);
  const [filters, setFilters] = useState(props.initialFilters), [filtersOpen, setFiltersOpen] = useState(false), [limit, setLimit] = useState(20);
  const currentHref = inboxHref(props.queue, filters);
  useEffect(() => {
    const position = readInboxMemory(props.userId).positions?.[inboxHref(props.queue, props.initialFilters)];
    if (!position || !Number.isFinite(position.scroll)) return;
    queueMicrotask(() => {
      if (Number.isFinite(position.limit) && position.limit! > 20) setLimit(position.limit!);
      setRestoring(position);
    });
  }, [props.userId, props.queue, props.initialFilters]);
  useEffect(() => {
    if (!restoring) return;
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, restoring.scroll);
      if (restoring.focusId) document.getElementById(restoring.focusId)?.focus({ preventScroll: true });
      setRestoring(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [restoring]);
  function patch(values: Partial<InboxFilters>) {
    const next = { ...filters, ...values }, href = inboxHref(props.queue, next);
    setFilters(next); setLimit(20); rememberInbox(props.userId, href, props.queue);
    if (next.archived !== props.initialFilters.archived) window.location.assign(href);
    else window.history.replaceState(window.history.state, '', href);
  }
  const visible = filterInboxRows(props.rows, filters, locale), shown = visible.slice(0, limit);
  const countries = [...new Map(props.rows.map(row => [row.countryKey, row.country])).entries()].sort((a, b) => a[1].localeCompare(b[1], locale));
  const active = [filters.workStatus, filters.country, filters.kind, filters.archived].filter(Boolean).length;
  const chips = [
    ...(filters.workStatus ? [{ field: 'workStatus', label: t(statusMessage(filters.workStatus)) }] : []),
    ...(filters.country ? [{ field: 'country', label: countries.find(([id]) => id === filters.country)?.[1] ?? t(inboxUi.country) }] : []),
    ...(filters.kind ? [{ field: 'kind', label: t(kindMessage(filters.kind as InboxKind)) }] : []),
    ...(filters.archived ? [{ field: 'archived', label: t(workflowUi.archived) }] : []),
  ];
  return { ...props, t, locale, filters, filtersOpen, setFiltersOpen, limit, setLimit, patch, currentHref, visible, shown, countries, chips, active, hasCriteria: Boolean(filters.query || active), unavailable: props.sessionsUnavailable && props.importsUnavailable };
}
type Model = ReturnType<typeof useInbox>;

function InboxFilters({ model: m }: { model: Model }) {
  const { t, filters, patch } = m;
  const kinds: InboxKind[] = ['correction', 'legal', 'import'];
  return <WorkCollectionFilters searchLabel={t(inboxUi.search)} placeholder={t(inboxUi.searchPlaceholder)} query={filters.query} onQuery={query => patch({ query })} clearLabel={t(inboxUi.clearSearch)} filterLabel={t(inboxUi.filters)} expanded={m.filtersOpen} onExpanded={m.setFiltersOpen} activeCount={m.active}
    chipsLabel={t(inboxUi.activeFilters)}
    chips={m.chips.length ? <>{m.chips.map(chip => <button key={chip.field} type="button" className={collection.chip} aria-label={`${t(inboxUi.removeFilter)}: ${chip.label}`} onClick={() => patch({ [chip.field]: chip.field === 'archived' ? false : '' })}>{chip.label}<X size={13} aria-hidden="true" /></button>)}<button type="button" className={collection.textButton} onClick={() => patch({ workStatus: '', country: '', kind: '', archived: false })}>{t(inboxUi.clearFilters)}</button></> : null}
    footer={<span>{t(inboxUi.immediate)}</span>} doneLabel={t(inboxUi.done)}>
      <div className={collection.filterFields}>
        {m.queue === 'mine' ? <label>{t(workflowUi.filterStatus)}<select aria-label={t(workflowUi.filterStatus)} value={filters.workStatus} onChange={event => patch({ workStatus: event.target.value })}><option value="">{t(workflowUi.allStatuses)}</option>{workStatuses.map(status => <option key={status} value={status}>{t(statusMessage(status))}</option>)}</select></label> : null}
        <label>{t(inboxUi.country)}<select aria-label={t(inboxUi.country)} value={filters.country} onChange={event => patch({ country: event.target.value })}><option value="">{t(inboxUi.allCountries)}</option>{m.countries.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
        <label>{t(inboxUi.kind)}<select aria-label={t(inboxUi.kind)} value={filters.kind} onChange={event => patch({ kind: event.target.value })}><option value="">{t(inboxUi.allKinds)}</option>{kinds.map(kind => <option key={kind} value={kind}>{t(kindMessage(kind))}</option>)}</select></label>
        {m.queue === 'mine' ? <label>{t(workflowUi.filterArchive)}<select aria-label={t(workflowUi.filterArchive)} value={String(filters.archived)} onChange={event => patch({ archived: event.target.value === 'true' })}><option value="false">{t(workflowUi.unarchived)}</option><option value="true">{t(workflowUi.archived)}</option></select></label> : null}
      </div>
  </WorkCollectionFilters>;
}

function InboxWorkRow({ row, model: m }: { row: InboxRow; model: Model }) {
  const { t } = m, Icon = row.kind === 'legal' ? Scale : row.kind === 'import' ? Import : PenLine;
  const id = `work-${rowKey(row)}`, title = t(kindMessage(row.kind));
  const href = `${row.workspaceHref}${row.workspaceHref.includes('?') ? '&' : '?'}inbox=${encodeURIComponent(m.currentHref)}`;
  const action = t(m.queue === 'reviewing' ? inboxUi.review : m.queue === 'approved' ? inboxUi.publicationReview : row.kind !== 'import' && row.owned && row.status === 'open' ? ui.editorDynamic.continueEditing : workflowUi.viewWork);
  const date = row.updatedAt && Number.isFinite(new Date(row.updatedAt).valueOf()) ? `${t(inboxUi.updated)} ${new Intl.DateTimeFormat(m.locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(row.updatedAt))}` : t(inboxUi.noDate);
  const record = (focusId: string) => rememberInbox(m.userId, m.currentHref, m.queue, focusId, rowKey(row), m.limit);
  return <WorkCollectionRow data-work-id={row.id} kind={row.kind} icon={<Icon size={18} aria-hidden="true" />}
    title={<WorkRowLink id={`${id}-title`} href={href} onClick={() => record(`${id}-title`)}>{title}</WorkRowLink>}
    details={<>{row.version}<div className={collection.updated}>{date}</div></>}
    status={<Badge tone={statusTone(normalizedWorkStatus(row.status))}>{t(statusMessage(row.status))}</Badge>}
    actions={<><WorkRowAction id={`${id}-action`} href={href} onClick={() => record(`${id}-action`)}>{action}</WorkRowAction><WorkActions row={{ ...row, owned: m.queue === 'mine' && row.owned }} archived={m.filters.archived} returnTo={m.currentHref} label={`${title} · ${row.constitution} · ${row.version}`} /></>} />;
}

function InboxWorkList({ model: m }: { model: Model }) {
  const { t } = m;
  return <>
    <WorkCollectionMeta summary={<>{m.visible.length} {t(m.visible.length === 1 ? inboxUi.item : inboxUi.items)}{m.filters.archived ? ` · ${t(workflowUi.archived)}` : ''}</>} grouping={t(inboxUi.grouped)} />
    <div className={collection.countries}>{m.countries.filter(([key]) => m.shown.some(row => row.countryKey === key)).map(([key, name]) => <WorkCollectionGroup key={key} className="editor-session-country" title={name} icon={<Globe2 size={15} aria-hidden="true" />}>
      {[...new Set(m.shown.filter(row => row.countryKey === key).map(row => row.constitutionKey))].map(constitution => {
        const group = m.shown.filter(row => row.countryKey === key && row.constitutionKey === constitution), first = group[0];
        return <WorkCollectionSection key={constitution} className="editor-session-constitution" listClassName="editor-session-list" title={first.constitution}
          meta={[first.jurisdiction ?? (first.regional ? t(inboxUi.regionalUnavailable) : first.countryKey !== 'unavailable' ? t(inboxUi.national) : null), first.historical ? t(inboxUi.historical) : null].filter(Boolean).join(' · ')}>{group.map(row => <InboxWorkRow key={rowKey(row)} row={row} model={m} />)}</WorkCollectionSection>;

      })}
    </WorkCollectionGroup>)}</div>
    {m.shown.length < m.visible.length ? <div className={styles.loadMore}><p>{m.shown.length} / {m.visible.length} {t(inboxUi.items)}</p><button className="btn" type="button" onClick={() => m.setLimit(m.limit + 20)}>{t(inboxUi.showMore)}<ChevronDown size={15} aria-hidden="true" /></button></div> : null}
  </>;
}
function emptyInboxCopy(m: Model) {
  if (m.hasCriteria) return { title: inboxUi.noMatches, hint: inboxUi.noMatchesHint };
  if (m.queue === 'mine') return { title: inboxUi.start, hint: inboxUi.startHint };
  if (m.queue === 'reviewing') return { title: inboxUi.reviewEmpty, hint: inboxUi.reviewEmptyHint };
  return { title: inboxUi.publishEmpty, hint: inboxUi.publishEmptyHint };
}
function InboxEmpty({ model: m }: { model: Model }) {
  const { t } = m, copy = emptyInboxCopy(m);
  if (m.unavailable || (!m.rows.length && (m.sessionsUnavailable || m.importsUnavailable))) return <div className={styles.empty}><div className={styles.emptyIcon}><Inbox size={28} aria-hidden="true" /></div><h2>{t(m.unavailable ? inboxUi.unavailableTitle : inboxUi.incompleteTitle)}</h2><p>{t(m.unavailable ? inboxUi.unavailableHint : inboxUi.incompleteHint)}</p><a className="btn btn-primary" href={m.currentHref}>{t(inboxUi.retry)}</a></div>;
  return <div className={styles.empty}>
    <div className={styles.emptyIcon}>{m.hasCriteria ? <Search size={28} aria-hidden="true" /> : <Check size={28} aria-hidden="true" />}</div>
    <h2>{t(copy.title)}</h2>
    <p>{t(copy.hint)}</p>
    {m.hasCriteria ? <button type="button" className="btn" onClick={() => { m.patch(emptyInboxFilters); m.setFiltersOpen(false); }}>{t(inboxUi.clearAll)}</button> : <Link className="btn btn-primary" href="/"><BookOpen size={17} aria-hidden="true" />{t(inboxUi.choose)}</Link>}
    {m.queue === 'mine' && !m.filters.archived && !m.hasCriteria ? <a className={collection.textButton} href={inboxHref('mine', { ...emptyInboxFilters, archived: true })}>{t(workflowUi.archived)}</a> : null}
  </div>;
}
export function EditorInbox(props: Props) {
  const m = useInbox(props), { t } = m;
  return <EditorDeskFrame userId={m.userId} roles={m.roles} queue={m.queue} title={t(inboxUi.title)} intro={t(inboxUi.intro)} counts={m.counts} currentHref={m.currentHref}>
    <div className={styles.description}><p>{t(m.queue === 'mine' ? inboxUi.mineHint : m.queue === 'reviewing' ? inboxUi.reviewHint : inboxUi.publishHint)}</p><HelpTooltip label={t(m.queue === 'mine' ? inboxUi.mineHelp : inboxUi.queueHelp)}><span aria-hidden="true">ⓘ</span></HelpTooltip></div>
    {m.error ? <Alert tone="error">{m.error}</Alert> : null}
    {!m.unavailable && m.sessionsUnavailable ? <Alert tone="error">{t(inboxUi.sessionsUnavailable)} <a href={m.currentHref}>{t(inboxUi.retry)}</a></Alert> : null}
    {!m.unavailable && m.importsUnavailable ? <Alert tone="error">{t(inboxUi.importsUnavailable)} <a href={m.currentHref}>{t(inboxUi.retry)}</a></Alert> : null}
    {!m.unavailable && (m.rows.length > 0 || m.hasCriteria || m.filtersOpen) ? <InboxFilters model={m} /> : null}
    {!m.unavailable && m.visible.length ? <InboxWorkList model={m} /> : <InboxEmpty model={m} />}
  </EditorDeskFrame>;
}
