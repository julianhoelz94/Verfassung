'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import { ArrowLeft, BookOpen, ClipboardCheck, Inbox, PanelRight, Upload } from 'lucide-react';
import { FullWidthPage, PageChromeSurface, PageMenuBar, PageMenuFrame } from '../components/layout/PageChrome';
import { usePageChromeMetrics } from '../components/layout/usePageChromeMetrics';
import chrome from '../components/layout/PageChrome.module.css';
import { useTranslation } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import { workflowUi } from '../../lib/workflow-messages';
import { inboxUi } from '../../lib/editor-inbox-messages';
import { inboxHref, inboxQueues, safeInboxHref, selectedInboxQueue, type InboxQueue } from '../../lib/editor-inbox';
import styles from './editor-inbox.module.css';

const storageKey = (userId: string) => `atlas-editor-inbox:${userId}`;
type RememberedInbox = { queues?: Partial<Record<InboxQueue, string>>; work?: Record<string, string>; positions?: Record<string, { scroll: number; focusId: string; limit?: number }> };
export function readInboxMemory(userId: string): RememberedInbox {
  try { const value = JSON.parse(sessionStorage.getItem(storageKey(userId)) ?? '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
}
export function rememberInbox(userId: string, href: string, queue: InboxQueue, focusId = '', workKey?: string, limit?: number) {
  try {
    const memory = readInboxMemory(userId);
    memory.queues = { ...memory.queues, [queue]: href };
    memory.positions = { ...memory.positions, [href]: { scroll: window.scrollY, focusId, limit } };
    if (workKey) memory.work = { ...memory.work, [workKey]: href };
    sessionStorage.setItem(storageKey(userId), JSON.stringify(memory));
  } catch { /* The URL and native browser history remain available without storage. */ }
}
export const queueMessage = (queue: InboxQueue) => queue === 'mine' ? workflowUi.myWork : queue === 'reviewing' ? inboxUi.review : ui.nav.readyToPublish;

type Props = {
  userId: string; roles: string[]; title: ReactNode; children: ReactNode;
  queue?: InboxQueue; counts?: Partial<Record<InboxQueue, number | null>>;
  intro?: ReactNode; meta?: ReactNode; eyebrow?: ReactNode; context?: ReactNode;
  compact?: boolean;
  workKey?: string; returnTo?: string; currentHref?: string;
};

type NavigationProps = Pick<Props, 'userId' | 'roles' | 'queue' | 'workKey' | 'returnTo' | 'currentHref'>;
function useInboxNavigation({ userId, roles, queue, workKey, returnTo, currentHref }: NavigationProps) {
  const [memory, setMemory] = useState<RememberedInbox>({});
  useEffect(() => {
    const remembered = readInboxMemory(userId), target = safeInboxHref(returnTo);
    if (workKey && target) {
      remembered.work = { ...remembered.work, [workKey]: target };
      try { sessionStorage.setItem(storageKey(userId), JSON.stringify(remembered)); } catch { /* Explicit return links still work without storage. */ }
    }
    queueMicrotask(() => setMemory(remembered));
  }, [userId, workKey, returnTo]);
  const backHref = safeInboxHref(returnTo) ?? (workKey ? safeInboxHref(memory.work?.[workKey]) : null) ?? inboxHref(queue ?? selectedInboxQueue(roles));
  const activeQueue = queue ?? selectedInboxQueue(roles, new URLSearchParams(backHref.split('?')[1]).get('status') ?? undefined);
  const available = inboxQueues(roles);
  function queueHref(next: InboxQueue) {
    if (next === activeQueue) return workKey ? backHref : currentHref ?? inboxHref(next);
    return safeInboxHref(memory.queues?.[next]) ?? inboxHref(next);
  }
  return { backHref, activeQueue, available, hrefs: Object.fromEntries(available.map(item => [item, queueHref(item)])) };
}

export function EditorQueueBar({ available, activeQueue, hrefs, counts, actions }: {
  available: InboxQueue[]; activeQueue: InboxQueue; hrefs: Partial<Record<InboxQueue, string>>;
  counts?: Partial<Record<InboxQueue, number | null>>; actions?: ReactNode;
}) {
  const t = useTranslation();
  function moveFocus(event: KeyboardEvent<HTMLElement>) {
    const links = [...event.currentTarget.querySelectorAll<HTMLAnchorElement>('a')];
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1 : event.key === 'ArrowRight' ? (at + 1) % links.length : event.key === 'ArrowLeft' ? (at - 1 + links.length) % links.length : -1;
    if (next >= 0) { event.preventDefault(); links[next]?.focus(); }
  }
  return (<PageMenuBar compact label={t(inboxUi.queues)} className={styles.menu} data-queue-count={available.length}>
          <nav className={styles.queues} aria-label={t(inboxUi.queues)} onKeyDown={moveFocus}>
            {available.map(item => {
              const Icon = item === 'mine' ? Inbox : item === 'reviewing' ? ClipboardCheck : Upload;
              return <a key={item} href={hrefs[item]} className={chrome.tool} aria-current={activeQueue === item ? 'page' : undefined} aria-label={t(queueMessage(item))}>
                <Icon size={16} aria-hidden="true" /><span className={styles.queueLabel}>{t(queueMessage(item))}</span><span className={styles.shortQueueLabel}>{t(item === 'approved' ? inboxUi.publishShort : queueMessage(item))}</span>
                {counts?.[item] != null ? <span className={styles.count} aria-hidden="true">{counts[item]}</span> : null}
              </a>;
            })}
          </nav>
          {actions}
        </PageMenuBar>);
}

export function EditorWorkQueueBar(props: NavigationProps) {
  const navigation = useInboxNavigation(props);
  return <EditorQueueBar {...navigation} />;
}

function EditorDeskHeading({ compact, backHref, backLabel, title, eyebrow, meta, intro, workKey }: Pick<Props, 'compact' | 'title' | 'eyebrow' | 'meta' | 'intro' | 'workKey'> & { backHref: string; backLabel: string }) {
  const t = useTranslation();
  if (compact) return <header className={styles.compactHeading}>
    <a className={styles.compactBack} href={backHref} aria-label={backLabel} title={backLabel}><ArrowLeft size={18} aria-hidden="true" /></a>
    <div><div className={styles.compactMeta}>{eyebrow ? <span>{eyebrow}</span> : null}{meta}</div><h1>{title}</h1></div>
  </header>;
  return <header className={styles.heading}>
    <div>{eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}<h1>{title}</h1>{intro ? <p>{intro}</p> : null}{meta ? <div className={styles.headingMeta}>{meta}</div> : null}</div>
    {!workKey ? <Link className="btn btn-primary" href="/"><BookOpen size={17} aria-hidden="true" />{t(inboxUi.choose)}</Link> : null}
  </header>;
}

/** One measured PageChrome composition for the inbox and its real focused workspaces. */
export function EditorDeskFrame({ userId, roles, title, children, queue, counts, intro, meta, eyebrow, context, compact = false, workKey, returnTo, currentHref }: Props) {
  const t = useTranslation(), contextId = useId();
  const root = useRef<HTMLDivElement>(null), menu = useRef<HTMLDivElement>(null), navigation = useRef<HTMLElement>(null);
  usePageChromeMetrics(root, menu, navigation);
  const [contextShown, setContextShown] = useState(true);
  const inboxNavigation = useInboxNavigation({ userId, roles, queue, workKey, returnTo, currentHref });
  const { backHref, activeQueue } = inboxNavigation;
  const backLabel = `${t(inboxUi.back)} ${t(queueMessage(activeQueue))}`;
  return <FullWidthPage template={workKey ? 'workspace' : 'collection'} className={styles.page} data-compact-workspace={compact}>
    <PageChromeSurface ref={root} className={styles.surface} data-editor-desk>
      {workKey && !compact ? <div className={styles.breadcrumb}><a href={backHref}><ArrowLeft size={16} aria-hidden="true" />{backLabel}</a></div> : null}
      <EditorDeskHeading {...{ compact, backHref, backLabel, title, eyebrow, meta, intro, workKey }} />
      <PageMenuFrame ref={menu} data-editor-queue-frame>
        <EditorQueueBar {...inboxNavigation} counts={counts} actions={context ? <button type="button" className={[chrome.tool, styles.contextToggle].join(' ')} aria-expanded={contextShown} aria-controls={contextId} aria-label={t(contextShown ? inboxUi.hideContext : inboxUi.showContext)} title={t(contextShown ? inboxUi.hideContext : inboxUi.showContext)} onClick={() => setContextShown(!contextShown)}><PanelRight size={17} aria-hidden="true" /><span>{t(contextShown ? inboxUi.hideContext : inboxUi.showContext)}</span></button> : null} />
      </PageMenuFrame>
      <div className={[styles.body, context ? styles.focused : ''].join(' ')} data-context={Boolean(context && contextShown)}>
        <div className={styles.main}>{children}</div>
        {context ? <aside id={contextId} className={styles.context} hidden={!contextShown} aria-label={t(inboxUi.context)}>{context}</aside> : null}
      </div>
    </PageChromeSurface>
  </FullWidthPage>;
}
