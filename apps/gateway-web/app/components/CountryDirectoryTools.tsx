'use client';

import { useId, useState, type ReactNode } from 'react';
import { BookText, History } from 'lucide-react';
import { directoryUi } from '../../lib/country-directory-messages';
import { useTranslation } from './TranslationProvider';
import styles from './CountryDirectory.module.css';

export function CountryDirectoryTools({ background, historyHref }: { background?: ReactNode; historyHref: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const t = useTranslation();
  return <>
    <nav className={styles.toolbar} aria-label={t(directoryUi.tools)} onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
      {background ? <button type="button" className={styles.tool} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}><BookText aria-hidden="true" />{t(directoryUi.background)}</button> : null}
      <a className={styles.tool} href={historyHref}><History aria-hidden="true" />{t(directoryUi.history)}</a>
    </nav>
    {background ? <section id={id} className={styles.background} aria-label={t(directoryUi.background)} hidden={!open}>{background}</section> : null}
  </>;
}
