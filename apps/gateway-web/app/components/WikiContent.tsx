import type { WikiPageRevision } from '../../lib/api';
import { WikiBody } from './WikiBody';
import { WikiImages } from './WikiImages';
import { WikiSources } from './WikiSources';
import styles from './WikiContent.module.css';
import { wikiCitationIndex } from '../../lib/wiki-document';
import { WikiRichText } from './wiki/WikiRichText';

/** One content template for published wikis, editorial previews and old revisions. */
export function WikiContent({ page, preview = false }: { page: Pick<WikiPageRevision, 'summary' | 'body' | 'bodyDocument' | 'images' | 'sourceUrls' | 'citations'>; preview?: boolean }) {
  const { entries } = wikiCitationIndex(page.bodyDocument);
  const additional = (page.citations ?? []).filter(citation => !entries.some(entry => entry.reference.documentId === citation.documentId && entry.reference.revision === citation.revision));
  return <div className={styles.article}>
    <p data-translate-content>{page.summary}</p>
    <WikiImages images={page.images.filter(image => image.placement === 'before_body')} preview={preview} />
    {page.bodyDocument ? <WikiRichText document={page.bodyDocument} citations={page.citations ?? []} /> : <WikiBody body={page.body} />}
    <WikiImages images={page.images.filter(image => image.placement !== 'before_body')} preview={preview} />
    {entries.length ? <ol className={styles.sources}>{entries.map(({ reference, number }) => <li key={reference.id} value={number}><a href={`/documents/${reference.documentId}?revision=${reference.revision}`}>{page.citations?.find(item => item.documentId === reference.documentId && item.revision === reference.revision)?.title ?? reference.documentId}</a>{reference.locator ? ` · ${reference.locator}` : ''}</li>)}</ol> : null}
    {additional.length ? <ul>{additional.map(citation => <li key={citation.documentId}><a href={`/documents/${citation.documentId}?revision=${citation.revision}`}>{citation.title}</a>{citation.citationNote ? ` · ${citation.citationNote}` : ''}</li>)}</ul> : null}
    <WikiSources sourceUrls={page.sourceUrls ?? []} />
  </div>;
}
