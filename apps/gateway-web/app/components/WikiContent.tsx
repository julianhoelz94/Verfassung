import type { WikiPageRevision } from '../../lib/api';
import { WikiBody } from './WikiBody';
import { WikiImages } from './WikiImages';
import { WikiSources } from './WikiSources';
import styles from './WikiContent.module.css';

/** One content template for published wikis, editorial previews and old revisions. */
export function WikiContent({ page, preview = false }: { page: Pick<WikiPageRevision, 'summary' | 'body' | 'images' | 'sourceUrls'>; preview?: boolean }) {
  return <div className={styles.article}>
    <p data-translate-content>{page.summary}</p>
    <WikiImages images={page.images.filter(image => image.placement === 'before_body')} preview={preview} />
    <WikiBody body={page.body} />
    <WikiImages images={page.images.filter(image => image.placement !== 'before_body')} preview={preview} />
    <WikiSources sourceUrls={page.sourceUrls ?? []} />
  </div>;
}
