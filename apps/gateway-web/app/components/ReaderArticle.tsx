import type { ReactNode } from 'react';
import { useTranslation } from './TranslationProvider';
import { readerUi as copy } from '../../lib/reader-messages';
import { ReaderIcon } from './ReaderIcon';
import styles from './VersionReader.module.css';

export function ReaderArticle({ id, heading, label, caption, permalink, expanded, onToggle, metadata, children }: {
  id: string; heading: string; label?: string; caption?: string; permalink: string; expanded?: boolean; onToggle?: () => void; metadata: ReactNode; children: ReactNode;
}) {
  const t = useTranslation();
  return <li className={styles.article} id={id}><div className={styles.articleHead}>
    <h2 id={'unit-' + id} aria-label={heading} data-translate-content>{onToggle ? <button type="button" className="article-toggle" aria-expanded={expanded} aria-controls={'reader-body-' + id} onClick={onToggle}>{heading}</button> : label && caption && heading.includes(caption) ? <>{label}<span className={styles.articleCaption}>{caption}</span></> : heading}</h2>
    <div className={styles.articleActions} data-reader-chrome>
      <a className={styles.tool} aria-label={t(copy.passage) + ' · ' + heading} href={permalink}><ReaderIcon name="link" /></a>
      <details className={styles.articleMenu}><summary className={styles.tool} aria-label={t(copy.details) + ' · ' + heading}><ReaderIcon name="details" /></summary><div className={styles.articlePopover}>{metadata}</div></details>
    </div>
  </div><div id={'reader-body-' + id} hidden={onToggle ? !expanded : undefined}>{children}</div></li>;
}
