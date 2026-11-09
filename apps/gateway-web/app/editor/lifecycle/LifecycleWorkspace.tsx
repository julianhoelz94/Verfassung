'use client';

import { useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import { FilePenLine, History, PanelRight } from 'lucide-react';
import type { ConstitutionLifecycleEvent, ProvisionLifecycleEvent } from '../../../lib/api';
import { effectiveLifecycle, lifecycleDate, lifecycleEntries, lifecycleEventLabels, nextLifecycleEvents, type LifecycleScope, type LifecycleUnit, type LifecycleVersion } from '../../../lib/lifecycle-workspace';
import { lifecycleWorkspaceUi as copy } from '../../../lib/lifecycle-workspace-messages';
import { lifecycleStatusMessage } from '../../../lib/lifecycle-label';
import { useLocale, useTranslation } from '../../components/TranslationProvider';
import { Alert, Button, PageHeader } from '../../components/ui';
import { SettingInfo } from '../../components/SettingInfo';
import { PageChromeSurface, PageMenuBar, PageMenuDivider, PageMenuFrame } from '../../components/layout/PageChrome';
import { usePageChromeMetrics } from '../../components/layout/usePageChromeMetrics';
import { LifecycleEventForm, type LifecycleFormContext } from './LifecycleEventForm';
import { LifecycleHistory } from './LifecycleHistory';
import { appendLifecycleAction, appendProvisionAction } from './actions';
import chrome from '../../components/layout/PageChrome.module.css';
import styles from './LifecycleWorkspace.module.css';

type Props = LifecycleFormContext & { title: string; ownerName: string; ownerHref: string; events: ConstitutionLifecycleEvent[]; provisions: ProvisionLifecycleEvent[]; versions: LifecycleVersion[]; sourceVersionId?: string; units: LifecycleUnit[]; materials: Record<string, ReactNode>; asOf: string; returnTo: string; backHref?: string; initialEventId?: string; saved?: boolean; failed?: boolean };

export function LifecycleWorkspace(props: Props) {
  const t = useTranslation(), locale = useLocale(), root = useRef<HTMLDivElement>(null), menu = useRef<HTMLDivElement>(null), navigation = useRef<HTMLElement>(null);
  usePageChromeMetrics(root, menu, navigation);
  const [view, setView] = useState<'create' | 'history'>(props.initialEventId ? 'history' : 'create');
  const [scope, setScope] = useState<LifecycleScope>('whole');
  const preference = useSyncExternalStore(subscribeContext, readContext, () => true);
  const [contextOverride, setContextOverride] = useState<boolean>();
  const context = contextOverride ?? preference;
  const entries = lifecycleEntries(props.events, props.provisions), effective = effectiveLifecycle(props.events, props.asOf);
  const status = effective?.dateCertainty === 'approximate' ? 'uncertain' : ({ adopted: 'awaiting_commencement', commenced: 'in_force', restored: 'in_force', suspended: 'suspended', repealed: 'repealed' }[effective?.eventType ?? 'commenced']);
  const allowed = nextLifecycleEvents(props.events.at(-1));
  function toggleContext() { setContextOverride(!context); try { localStorage.setItem('atlas-lifecycle-context', context ? 'hidden' : 'shown'); window.dispatchEvent(new Event('lifecycle-context')); } catch { /* Optional preference. */ } }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const next = event.key === 'Home' ? 'create' : event.key === 'End' ? 'history' : view === 'create' ? 'history' : 'create';
    setView(next); root.current?.querySelector<HTMLButtonElement>(`#lifecycle-tab-${next}`)?.focus();
  }
  const formContext = { constitutionId: props.constitutionId, code: props.code, jurisdictionId: props.jurisdictionId, canCreate: props.canCreate };
  return <PageChromeSurface ref={root}>
    <div className={styles.header}><PageHeader eyebrow={t(copy.legalHistory)} title={t(copy.title)} breadcrumbs={[{ href: '/', label: t({ en: 'Countries', de: 'Länder' }) }, { href: props.ownerHref, label: props.ownerName }, { label: t(copy.title) }]} meta={<>{props.title} <span className={styles.badge}>{t(lifecycleStatusMessage(effective ? status : undefined))}</span></>} /></div>
    <PageMenuFrame ref={menu}><PageMenuBar compact label={t(copy.workspace)}>
      <div role="tablist" aria-label={t(copy.workspace)} className={styles.tabs}>
        <button type="button" role="tab" aria-label={t(copy.record)} id="lifecycle-tab-create" aria-controls="lifecycle-create" aria-selected={view === 'create'} tabIndex={view === 'create' ? 0 : -1} className={chrome.tool} onKeyDown={keyboard} onClick={() => setView('create')}><FilePenLine /><span>{t(copy.record)}</span></button>
        <button type="button" role="tab" aria-label={t(copy.history)} id="lifecycle-tab-history" aria-controls="lifecycle-history" aria-selected={view === 'history'} tabIndex={view === 'history' ? 0 : -1} className={chrome.tool} onKeyDown={keyboard} onClick={() => setView('history')}><History /><span>{t(copy.history)}</span><small>{entries.length}</small></button>
      </div><div className={styles.paneTool}><PageMenuDivider /><button type="button" className={chrome.tool} aria-expanded={context} aria-controls="lifecycle-context" aria-label={t(context ? copy.hideContext : copy.showContext)} title={t(context ? copy.hideContext : copy.showContext)} onClick={toggleContext}><PanelRight /><span>{t(copy.context)}</span></button></div>
    </PageMenuBar></PageMenuFrame>
    <div className={styles.workspace} data-context={context}>
      <div className={styles.main}>
        {props.backHref ? <a href={props.backHref}>{t({ en: 'Return to event', de: 'Zurück zum Ereignis' })}</a> : null}
        {props.saved ? <Alert tone="success">{t(copy.saved)}</Alert> : null}{props.failed ? <Alert tone="error">{t(copy.failed)}</Alert> : null}
        <div id="lifecycle-create" role="tabpanel" aria-labelledby="lifecycle-tab-create" hidden={view !== 'create'}>
          <div className={styles.composer}><div className={styles.scopeBody}><div className={styles.heading}><h2 className={styles.sectionTitle}><span>1</span>{t(copy.scope)}</h2><SettingInfo label={t(copy.scope)} description={t(copy.scopeInfo)} changeability="once" changeNote={t({ en: 'Scope is fixed after recording the event.', de: 'Der Geltungsbereich bleibt nach der Erfassung fest.' })} /></div>
            <fieldset className={styles.scopePicker}><legend className="visually-hidden">{t(copy.scope)}</legend>{(['whole', 'passages'] as const).map(value => <label key={value}><input type="radio" name="scope" value={value} checked={scope === value} onChange={() => setScope(value)} /><span>{t(value === 'whole' ? copy.whole : copy.passages)}<small>{t(value === 'whole' ? copy.wholeHelp : copy.passagesHelp)}</small></span></label>)}</fieldset>
          </div>
          <div hidden={scope !== 'whole'}><LifecycleEventForm {...formContext} scope="whole" allowed={allowed} lastDate={props.events.at(-1)?.eventDate} versions={props.versions} initialVersionId={props.sourceVersionId} initialUnits={props.units} action={appendLifecycleAction} /></div>
          <div hidden={scope !== 'passages'}><LifecycleEventForm {...formContext} scope="passages" allowed={['deferred', 'commenced', 'suspended', 'restored']} versions={props.versions} initialVersionId={props.sourceVersionId} initialUnits={props.units} action={appendProvisionAction} /></div>
          </div>
        </div>
        <div id="lifecycle-history" role="tabpanel" aria-labelledby="lifecycle-tab-history" hidden={view !== 'history'}><LifecycleHistory entries={entries} materials={props.materials} constitutionId={props.constitutionId} code={props.code} returnTo={props.returnTo} initialEventId={props.initialEventId} /></div>
      </div>
      <aside id="lifecycle-context" className={styles.context} hidden={!context} aria-label={t(copy.context)}>
        <section><p className={styles.eyebrow}>{t(copy.currentStatus)}</p><h2>{t(lifecycleStatusMessage(effective ? status : undefined))}</h2>{effective ? <p className={styles.muted}>{t(copy.lastEffective)}:<br />{t(lifecycleEventLabels[effective.eventType])} · {lifecycleDate(effective.eventDate, locale, effective.dateCertainty === 'approximate')}</p> : <p>{t(copy.noEvents)}</p>}</section>
        <section><h2>{t(copy.existingHistory)}</h2><ol className={styles.timeline}>{entries.slice(0, 3).map(event => <li key={event.id}><time dateTime={event.eventDate}>{lifecycleDate(event.eventDate, locale, 'dateCertainty' in event && event.dateCertainty === 'approximate')}</time><p>{t(lifecycleEventLabels[event.eventType])}</p></li>)}</ol><Button type="button" variant="ghost" onClick={() => setView('history')}>{t(copy.allHistory)} →</Button></section>
        <p className={styles.muted}>{t(copy.contextHelp)}</p>
      </aside>
    </div>
  </PageChromeSurface>;
}

function readContext() { try { return localStorage.getItem('atlas-lifecycle-context') !== 'hidden'; } catch { return true; } }
function subscribeContext(notify: () => void) {
  window.addEventListener('storage', notify); window.addEventListener('lifecycle-context', notify);
  return () => { window.removeEventListener('storage', notify); window.removeEventListener('lifecycle-context', notify); };
}
