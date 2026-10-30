'use client';

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { FootnoteItem } from '../../lib/footnotes';
import { useTranslation } from './TranslationProvider';
import { InlineText } from './InlineText';
import { updateFootnoteHitTargets } from '../../lib/footnote-hit-targets';
import styles from './Footnotes.module.css';

export type { FootnoteItem } from '../../lib/footnotes';
const copy = {
  footnote: { en: 'Footnote', de: 'Fußnote' },
  show: { en: 'Show footnote', de: 'Fußnote anzeigen' },
  close: { en: 'Close footnote', de: 'Fußnote schließen' },
  jump: { en: 'Go to footnote', de: 'Zur Fußnote' },
  navigationFailed: { en: 'The footnote could not be loaded. Try “Go to footnote” again.', de: 'Die Fußnote konnte nicht geladen werden. Versuchen Sie „Zur Fußnote“ erneut.' },
};
type Actions = {
  showNote: (id: string, trigger?: HTMLElement) => void;
  previewNote: (id: string, trigger: HTMLElement) => void;
  hidePreview: () => void;
};
type Context = Actions & { notes: FootnoteItem[]; tooltipId: string; previewId?: string };
const Context = createContext<Context | null>(null);
const noopActions: Actions = { showNote: () => {}, previewNote: () => {}, hidePreview: () => {} };
export function useFootnoteActions(): Actions { return useContext(Context) ?? noopActions; }
export function useFootnoteReferences(noteId: string) { return useContext(Context)?.notes.find(note => note.logicalId === noteId)?.references ?? []; }

export function FootnoteProvider({ notes, children, onNavigate }: {
  notes: FootnoteItem[]; children?: ReactNode; onNavigate?: (note: FootnoteItem) => void | Promise<void>;
}) {
  const parent = useContext(Context);
  return parent ? <>{children}</> : <FootnoteScope notes={notes} onNavigate={onNavigate}>{children}</FootnoteScope>;
}

function FootnoteScope({ notes, children, onNavigate }: {
  notes: FootnoteItem[]; children?: ReactNode; onNavigate?: (note: FootnoteItem) => void | Promise<void>;
}) {
  const t = useTranslation(), id = useId();
  const [opened, setOpened] = useState<string | null>(null);
  const [navigating, setNavigating] = useState(false), [navigationError, setNavigationError] = useState(false);
  const [peek, setPeek] = useState<{ id: string; left: number; top: number } | null>(null);
  const trigger = useRef<HTMLElement | null>(null), drawer = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const active = notes.find(note => note.logicalId === opened);
  const activeId = active?.logicalId;
  const preview = notes.find(note => note.logicalId === peek?.id);
  useLayoutEffect(()=>updateFootnoteHitTargets());
  useEffect(()=>{const update=()=>updateFootnoteHitTargets();window.addEventListener('resize',update);return()=>window.removeEventListener('resize',update);},[]);
  const close = useCallback((restore = false) => {
    setOpened(null); setPeek(null); setNavigationError(false);
    if (restore) trigger.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!activeId) return;
    closeButton.current?.focus({ preventScroll: true });
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !drawer.current?.contains(event.target)) setOpened(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    }
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true); };
  }, [activeId, close]);
  useEffect(() => {
    if (!peek) return;
    const hide = () => setPeek(null);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
    window.addEventListener('scroll', hide, true); window.addEventListener('resize', hide);
    document.addEventListener('keydown', escape);
    return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); document.removeEventListener('keydown', escape); };
  }, [peek]);
  const actions: Context = {
    notes, tooltipId: id + '-peek', previewId: peek?.id,
    showNote(noteId, element) {
      if (!notes.some(note => note.logicalId === noteId)) return;
      trigger.current = element ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      setPeek(null); setNavigationError(false); setOpened(noteId);
    },
    previewNote(noteId, element) {
      if (opened || !notes.some(note => note.logicalId === noteId) || window.matchMedia?.('(pointer: coarse)').matches) return;
      const rect = element.getBoundingClientRect();
      setPeek({ id: noteId, left: Math.max(8, Math.min(rect.left, window.innerWidth - 328)), top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight * .7 - 32)) });
    },
    hidePreview() { setPeek(null); },
  };
  return <Context.Provider value={actions}>
    {children}
    {typeof document !== 'undefined' && active ? createPortal(
      <section className={styles.drawer} ref={drawer} role="dialog" aria-modal="false" aria-labelledby={id + '-title'} aria-describedby={id + '-body'}>
        <div className={styles.heading}><h2 id={id + '-title'}>{t(copy.footnote)} {active.label}</h2><button ref={closeButton} type="button" aria-label={t(copy.close)} onClick={() => close(true)}>×</button></div>
        <div id={id + '-body'} className={styles.body}><InlineText text={active.text} marks={active.marks} /></div>
        {navigationError ? <p role="alert">{t(copy.navigationFailed)}</p> : null}
        <a href={active.href} aria-busy={navigating || undefined} aria-disabled={navigating || undefined} onClick={async event => {
          if (onNavigate) {
            event.preventDefault(); if (navigating) return;
            setNavigating(true); setNavigationError(false);
            try {
              await onNavigate(active); close();
              requestAnimationFrame(() => document.getElementById(decodeURIComponent(active.href.split('#')[1] ?? ''))?.scrollIntoView({ block: 'center' }));
            } catch { setNavigationError(true); }
            finally { setNavigating(false); }
          } else {
            const destination = new URL(active.href, window.location.href);
            if (destination.pathname === window.location.pathname && destination.search === window.location.search) {
              const target = document.getElementById(decodeURIComponent(destination.hash.slice(1)));
              if (target) { event.preventDefault(); close(); target.scrollIntoView({ block: 'center' }); window.history.replaceState(null, '', destination.hash); return; }
            }
            close();
          }
        }}>{t(copy.jump)}</a>
      </section>, document.body) : null}
    {typeof document !== 'undefined' && preview && peek ? createPortal(
      <aside role="tooltip" id={id + '-peek'} className={styles.peek} style={{ left: peek.left, top: peek.top }}>
        <span>{preview.label} · </span><InlineText text={preview.text} marks={preview.marks} />
      </aside>, document.body) : null}
  </Context.Provider>;
}

export function FootnoteMarker({ noteId, label, referenceId, children }: {
  noteId: string; label?: string; referenceId?: string; children?: ReactNode;
}) {
  const context = useContext(Context), t = useTranslation();
  const note = context?.notes.find(note => note.logicalId === noteId);
  if (!note || !context) return <sup id={referenceId}>{children ?? label ?? '*'}</sup>;
  return <a href={note.href} role="button" contentEditable={false} data-footnote-marker data-footnote-text={children != null ? 'true' : undefined} id={referenceId} className={styles.marker}
    aria-label={t(copy.show) + ' ' + note.label} aria-haspopup="dialog" aria-describedby={context.previewId === noteId ? context.tooltipId : undefined}
    onClick={event => { event.preventDefault(); context.showNote(noteId, event.currentTarget); }}
    onKeyDown={event => { if (event.key === ' ') { event.preventDefault(); context.showNote(noteId, event.currentTarget); } }}
    onMouseEnter={event => context.previewNote(noteId, event.currentTarget)} onMouseLeave={context.hidePreview}
    onFocus={event => context.previewNote(noteId, event.currentTarget)} onBlur={context.hidePreview}
  >{children ?? label ?? note.label}</a>;
}
