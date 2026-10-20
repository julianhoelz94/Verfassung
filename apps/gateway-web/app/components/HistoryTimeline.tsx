'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { HistoryKind } from '../../lib/history';
import { usability } from '../../lib/usability-messages';
import { T, useTranslation } from './TranslationProvider';

export type HistoryMilestone = { kind: HistoryKind; id: string; date?: string | null; title: string; content: ReactNode };

/** The server renders the complete chronology; enhancement selects one detail panel. */
export function HistoryTimeline({ items }: { items: HistoryMilestone[] }) {
  const t = useTranslation();
  const [selected, setSelected] = useState(0);
  const [enhanced, setEnhanced] = useState(false);
  const rail = useRef<HTMLDivElement>(null);
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
  function choose(index: number, focus = false) {
    setSelected(index);
    window.history.replaceState(window.history.state, '', `#history-event-${items[index].id}`);
    const button = rail.current?.querySelector<HTMLButtonElement>(`[data-event-index="${index}"]`);
    button?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    if (focus) button?.focus({ preventScroll: true });
  }
  return <section className="history-timeline" aria-label={t(usability.milestones)}>
    <p className="muted"><T value={usability.milestoneHint} /></p>
    <div className="history-controls">
      <label className="field" htmlFor="history-year"><T value={usability.jumpYear} />
        <select id="history-year" value={items[current].date?.slice(0, 4) || ''} onChange={event => choose(groups.get(event.target.value)?.[0] ?? 0)}>
          {[...groups.keys()].map(year => <option key={year} value={year}>{year || t(usability.undated)}</option>)}
        </select>
      </label>
      <div className="form-row">
        <button type="button" className="btn btn-sm" disabled={current === 0} onClick={() => choose(current - 1)}><T value={usability.previous} /></button>
        <button type="button" className="btn btn-sm" disabled={current === items.length - 1} onClick={() => choose(current + 1)}><T value={usability.next} /></button>
      </div>
    </div>
    <div ref={rail} className="history-rail" role="region" tabIndex={0} aria-label={t(usability.timelineNavigation)} onKeyDown={event => {
      let index: number;
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
            aria-label={items[index].title} aria-describedby={`history-kind-${items[index].id}`} className="history-milestone" aria-pressed={current === index} aria-controls={`history-event-${items[index].id}`} onClick={() => choose(index)}>
            <span id={`history-kind-${items[index].id}`} className="history-kind">{t(items[index].kind === 'constitution' ? usability.constitutionEvent : usability.amendmentEvent)}</span>
            {items[index].title}
          </button>)}</div>
        </li>)}
      </ol>
    </div>
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
