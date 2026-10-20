'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { HistoryKind } from '../../lib/history';
import { usability } from '../../lib/usability-messages';
import { ui } from '../../lib/messages';
import { T, useTranslation } from './TranslationProvider';
import { Inline } from './layout/Layout';
import fieldStyles from './fields.module.css';

export type HistoryMilestone = { kind: HistoryKind; id: string; date?: string | null; dateApproximate?: boolean; title: string; content: ReactNode };

/** The server renders the complete chronology; enhancement selects one detail panel. */
export function HistoryTimeline({ items }: { items: HistoryMilestone[] }) {
  const t = useTranslation();
  const [selected, setSelected] = useState(0);
  const [enhanced, setEnhanced] = useState(false);
  const rail = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<{ index: number; x: number; top: number; below: boolean; maxHeight: number } | null>(null);
  const previewAnchor = useRef<HTMLButtonElement | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout>>();
  function cancelDismiss() { clearTimeout(dismissTimer.current); }
  function dismissPreview() {
    cancelDismiss();
    dismissTimer.current = setTimeout(() => {
      if (!previewAnchor.current?.matches(':focus-visible')) setPreview(null);
    }, 150);
  }
  function showPreview(index: number, button: HTMLButtonElement) {
    cancelDismiss();
    previewAnchor.current = button;
    const bounds = button.getBoundingClientRect();
    const aboveSpace = bounds.top - 16;
    const belowSpace = window.innerHeight - bounds.bottom - 16;
    const below = aboveSpace < 200 && belowSpace > aboveSpace;
    setPreview({ index, x: bounds.left + bounds.width / 2, top: below ? bounds.bottom + 8 : bounds.top - 8, below, maxHeight: Math.max(48, (below ? belowSpace : aboveSpace) - 8) });
  }
  useEffect(() => {
    const dismiss = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('#history-preview')) return;
      setPreview(null);
    };
    const dismissOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', dismissOnEscape);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      clearTimeout(dismissTimer.current);
      window.removeEventListener('keydown', dismissOnEscape);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, []);
  useEffect(() => {
    function selectFromAddress() {
      const index = items.findIndex(item => `#history-event-${item.id}` === window.location.hash);
      setSelected(index < 0 ? 0 : index);
      setEnhanced(true);
    }
    selectFromAddress();
    window.addEventListener('hashchange', selectFromAddress);
    return () => window.removeEventListener('hashchange', selectFromAddress);
  }, [items]);
  if (!items.length) return null;
  const current = Math.min(selected, items.length - 1);
  const groups = new Map<string, number[]>();
  items.forEach((item, index) => {
    const year = item.date?.slice(0, 4) || '';
    groups.set(year, [...(groups.get(year) ?? []), index]);
  });
  function dateLabel(item: HistoryMilestone) {
    return item.date ? `${item.dateApproximate ? t(ui.remainingStatus.circa) : ''}${item.date}` : t(usability.undated);
  }
  function choose(index: number, focus = false) {
    setPreview(null);
    setSelected(index);
    window.history.replaceState(window.history.state, '', `#history-event-${items[index].id}`);
    const button = rail.current?.querySelector<HTMLButtonElement>(`[data-event-index="${index}"]`);
    button?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    if (focus) button?.focus({ preventScroll: true });
  }
  return <section className="history-timeline" aria-label={t(usability.milestones)}>
    <p className="muted"><T value={usability.milestoneHint} /></p>
    <div className="history-controls">
      <label className={["field", fieldStyles.field].join(' ')} htmlFor="history-year"><T value={usability.jumpYear} />
        <select id="history-year" value={items[current].date?.slice(0, 4) || ''} onChange={event => choose(groups.get(event.target.value)?.[0] ?? 0)}>
          {[...groups.keys()].map(year => <option key={year} value={year}>{year || t(usability.undated)}</option>)}
        </select>
      </label>
      <Inline align="end" className="form-row">
        <button type="button" className="btn btn-sm" disabled={current === 0} onClick={() => choose(current - 1)}><T value={usability.previous} /></button>
        <button type="button" className="btn btn-sm" disabled={current === items.length - 1} onClick={() => choose(current + 1)}><T value={usability.next} /></button>
      </Inline>
    </div>
    <div ref={rail} className="history-rail" role="region" tabIndex={0} aria-label={t(usability.timelineNavigation)} onKeyDown={event => {
      let index: number;
      if (event.key === 'Escape') { setPreview(null); return; }
      if (event.key === 'ArrowRight') index = Math.min(current + 1, items.length - 1);
      else if (event.key === 'ArrowLeft') index = Math.max(current - 1, 0);
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = items.length - 1;
      else return;
      event.preventDefault();
      choose(index, true);
    }}>
      <ol className="history-years">
        {[...groups].map(([year, indexes]) => <li key={year}>
          <span className="history-year">{year || t(usability.undated)} <span className="muted">({indexes.length})</span></span>
          <div className="history-year-events">{indexes.map(index => <button key={items[index].id} type="button" data-event-index={index}
            aria-label={items[index].title} aria-describedby={preview?.index === index ? 'history-preview' : `history-kind-${items[index].id}`}
            className="history-milestone" aria-pressed={current === index} aria-controls={`history-event-${items[index].id}`}
            onPointerEnter={event => { if (event.pointerType !== 'touch') showPreview(index, event.currentTarget); }}
            onPointerLeave={dismissPreview}
            onFocus={event => { if (event.currentTarget.matches(':focus-visible')) showPreview(index, event.currentTarget); }}
            onBlur={() => { cancelDismiss(); setPreview(null); }}
            onClick={() => choose(index)}>
            <span id={`history-kind-${items[index].id}`} className="sr-only">{t(items[index].kind === 'constitution' ? usability.constitutionEvent : usability.amendmentEvent)} · {dateLabel(items[index])}</span>
            <span className="history-marker" data-kind={items[index].kind} aria-hidden="true" />
          </button>)}</div>
        </li>)}
      </ol>
    </div>
    {preview && items[preview.index] ? <div id="history-preview" role="tooltip"
      className={`history-preview${preview.below ? ' history-preview-below' : ''}`}
      style={{ '--history-preview-x': `${preview.x}px`, top: preview.top, maxHeight: preview.maxHeight } as CSSProperties}
      onPointerEnter={cancelDismiss} onPointerLeave={dismissPreview}>
      <span className="history-kind">{t(items[preview.index].kind === 'constitution' ? usability.constitutionEvent : usability.amendmentEvent)} · {dateLabel(items[preview.index])}</span>
      <strong>{items[preview.index].title}</strong>
    </div> : null}
    <ol className="timeline history-details">
      {items.map((item, index) => <li key={item.id} id={`history-event-${item.id}`} className="timeline-item" data-kind={item.kind} data-date={item.date ?? ''} hidden={enhanced && current !== index}>
        <div className="history-kind">{t(item.kind === 'constitution' ? usability.constitutionEvent : usability.amendmentEvent)}</div>
        {item.content}
      </li>)}
    </ol>
    <details className="disclosure history-list">
      <summary><T value={usability.chronologicalList} /></summary>
      <ol>{items.map((item, index) => <li key={item.id}>
        <a href={`#history-event-${item.id}`} onClick={() => setSelected(index)}>{item.date?.slice(0, 4) || t(usability.undated)} · {item.title}</a>
      </li>)}</ol>
    </details>
  </section>;
}
