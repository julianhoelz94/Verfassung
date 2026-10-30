'use client';

import { useState, type ReactNode } from 'react';
import { readerUi } from '../../lib/reader-messages';
import { ReaderIcon } from './ReaderIcon';
import { useTranslation } from './TranslationProvider';
import styles from './WikiPanel.module.css';
import { ContentTranslationControlSlot } from './ContentTranslationControlSlot';

export type WikiPanelContent = { title: ReactNode; children: ReactNode; actions?: ReactNode };

export function WikiPanel({ id, title, children, actions, onClose, hidden }: WikiPanelContent & { id: string; onClose: () => void; hidden?: boolean }) {
  const t = useTranslation();
  const [translationSlot, setTranslationSlot] = useState<HTMLDivElement | null>(null);
  return <section id={id} className={styles.panel} aria-label={t(readerUi.wiki)} hidden={hidden} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
  }}>
    <div className={styles.header}><div className={styles.eyebrow}>{t(readerUi.context)}</div><div className={styles.controls}><div ref={setTranslationSlot} className={styles.translation} /><button type="button" className={styles.close} aria-label={t(readerUi.closeWiki)} onClick={onClose}><ReaderIcon name="close" /></button></div></div>
    <h2 className={styles.title}>{title}</h2>
    <ContentTranslationControlSlot.Provider value={translationSlot}><div className={styles.content}>{children}</div></ContentTranslationControlSlot.Provider>
    {actions ? <div className={styles.actions}>{actions}</div> : null}
  </section>;
}
