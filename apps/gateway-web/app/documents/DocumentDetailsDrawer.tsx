'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '../components/TranslationProvider';
import { documentLibraryUi as m } from '../../lib/document-library-messages';
import chrome from '../components/layout/PageChrome.module.css';
import styles from './DocumentDetailsDrawer.module.css';

type Props = {
  id: string; open: boolean; title: string; height: number; children: ReactNode;
  onHeightChange: (height: number) => void; onClose: () => void;
};

export function DocumentDetailsDrawer({ id, open, title, height, children, onHeightChange, onClose }: Props) {
  const t = useTranslation();
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const drag = useRef<{ y: number; height: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus({ preventScroll: true });
    return () => { trigger.current?.focus({ preventScroll: true }); };
  }, [open]);

  function resize(value: number) { onHeightChange(Math.max(25, Math.min(85, Math.round(value)))); }

  return <section id={id} hidden={!open} className={styles.drawer} role="dialog" aria-modal="false" aria-labelledby={`${id}-title`}
    onKeyDown={event => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.target instanceof HTMLSelectElement) return;
      event.preventDefault(); event.stopPropagation(); onClose();
    }}>
    <div role="separator" tabIndex={0} aria-label={t(m.resizeDetails)} aria-orientation="horizontal" aria-controls={`${id}-body`}
      aria-valuemin={25} aria-valuemax={85} aria-valuenow={height} aria-valuetext={`${height}%`} className={styles.resize}
      onKeyDown={event => {
        const values: Record<string, number> = { ArrowUp: height + 5, ArrowDown: height - 5, Home: 25, End: 85 };
        if (!(event.key in values)) return;
        event.preventDefault(); resize(values[event.key]);
      }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        drag.current = { y: event.clientY, height }; event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => { if (drag.current) resize(drag.current.height + (drag.current.y - event.clientY) / window.innerHeight * 100); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
    <header className={styles.heading}><h2 id={`${id}-title`}>{title}</h2>
      <button ref={closeButton} type="button" className={chrome.tool} aria-label={t(m.closeDetails)} title={t(m.closeDetails)} onClick={onClose}><X aria-hidden="true" /></button>
    </header>
    <div id={`${id}-body`} className={styles.body}>{children}</div>
  </section>;
}
