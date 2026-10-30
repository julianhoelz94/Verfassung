import type { WikiPageRevision, WikiTargetType } from '../../lib/api';
import { directoryUi } from '../../lib/country-directory-messages';
import { ui } from '../../lib/messages';
import { ContentTranslationRegion } from './ContentTranslationRegion';
import { T } from './TranslationProvider';
import { WikiBody } from './WikiBody';
import { WikiImages } from './WikiImages';
import { WikiSources } from './WikiSources';
import styles from './DirectoryWiki.module.css';

export function DirectoryWiki({ targetType, targetId, name, code, page, unavailable, canEdit, canReview }: { targetType: WikiTargetType; targetId: string; name: string; code?: string; page: WikiPageRevision | null; unavailable?: boolean; canEdit?: boolean; canReview?: boolean }) {
  return <>
    <header className={styles.header}><h2><T value={ui.countries.code.page.about} /> {name}</h2>{canEdit || canReview ? <a className={styles.edit} href={`/editor/wiki/${targetType}/${targetId}${code ? `?code=${encodeURIComponent(code)}` : ''}`}><T value={canEdit ? directoryUi.editWiki : directoryUi.reviewWiki} /></a> : null}</header>
    {unavailable ? <p role="status"><T value={directoryUi.wikiUnavailable} /></p> : page ? <>
      <ContentTranslationRegion sourceLanguage="auto"><p data-translate-content>{page.summary}</p><WikiImages images={page.images.filter(image => image.placement === 'before_body')} /><WikiBody body={page.body} /></ContentTranslationRegion>
      <WikiImages images={page.images.filter(image => image.placement !== 'before_body')} /><WikiSources sourceUrls={page.sourceUrls ?? []} />
    </> : <p><T value={directoryUi.noWiki} /></p>}
  </>;
}
