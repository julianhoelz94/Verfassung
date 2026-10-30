import type { ReactNode } from 'react';
import { useTranslation } from './TranslationProvider';
import { readerUi as copy } from '../../lib/reader-messages';
import { ReaderIcon } from './ReaderIcon';
import styles from './VersionReader.module.css';
import documentStyles from './ConstitutionDocument.module.css';

export function ReaderArticle({ id, heading, headingContent, expanded, onToggle, metadata, children }: {
  id: string; heading: string; headingContent?: ReactNode; expanded?: boolean; onToggle?: () => void; metadata: ReactNode; children: ReactNode;
}) {
  const t = useTranslation();
  return <li className={documentStyles.article} id={id}><div className={[documentStyles.articleHeader, styles.articleHead].join(' ')}>
    <h2 className={documentStyles.articleHeading} tabIndex={-1} id={'unit-' + id} aria-label={heading} data-translate-content>{onToggle ? <button type="button" className="article-toggle" aria-expanded={expanded} aria-controls={'reader-body-' + id} onClick={onToggle}><span>{headingContent ?? heading}</span></button> : headingContent ?? heading}</h2>
    <div className={styles.articleActions} data-reader-chrome>
      <details className={styles.articleMenu}><summary role="button" className={styles.tool} aria-label={t(copy.details) + ' · ' + heading}><ReaderIcon name="details" /></summary><div className={styles.articlePopover}>{metadata}</div></details>
    </div>
  </div><div id={'reader-body-' + id} hidden={onToggle ? !expanded : undefined}>{children}</div></li>;
}
