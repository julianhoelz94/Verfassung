import type { ReactNode } from 'react';
import type { WikiPageRevision } from '../../lib/api';
import type { WikiOwner } from '../../lib/wiki-routing';
import type { Locale } from '../../lib/locale';
import { message, ui } from '../../lib/messages';
import { directoryUi } from '../../lib/country-directory-messages';
import { T } from './TranslationProvider';
import { WorkspacePage } from './layout/templates';
import { PageHeader } from './ui';
import { Stack } from './layout/Layout';
import { WikiContent } from './WikiContent';
import { WikiImages } from './WikiImages';
import { WikiDraftForm } from '../editor/wiki/WikiDraftForm';
import styles from './WikiEditorTemplate.module.css';

export type WikiEditorTemplateProps = {
  owner: WikiOwner; title: ReactNode; publicHref: string; locale: Locale;
  draft: WikiPageRevision | null; published: WikiPageRevision | null; history: WikiPageRevision[];
  historyPage: number; historyHref: (page: number) => string;
  query: { saved?: string; published?: string; error?: string };
  embedded: boolean; returnTo?: string; canEdit: boolean; canPublish: boolean; canReview: boolean;
  saveAction: (form: FormData) => Promise<string>; publishAction: (form: FormData) => Promise<string>;
};

/** Shared editing, review and revision layout; callers own loading, permissions and commands. */
export function WikiEditorTemplate({ owner, title, publicHref, locale, draft, published, history, historyPage, historyHref, query, embedded, returnTo, canEdit, canPublish, canReview, saveAction, publishAction }: WikiEditorTemplateProps) {
  const { targetType, targetId, code = '', jurisdictionId } = owner;
  const current = draft ?? published;
  const draftPreview = draft && draft.id !== published?.id ? <>
    <h2><T value={ui.editor.wiki.targettype.targetid.page.reviewDraft} /></h2>
    <WikiContent page={draft} preview />
  </> : null;
  const body = <section className={styles.workspace} aria-label={message(locale, embedded && targetType === 'constitution' ? { en: 'Constitution Wiki', de: 'Verfassungs-Wiki' } : directoryUi.background)}>
      {embedded ? <header><h2><T value={{ en: 'Constitution Wiki', de: 'Verfassungs-Wiki' }} /></h2><p className="muted"><T value={{ en: 'Context for all versions. Saved and published separately from constitutional text.', de: 'Hintergrund für alle Fassungen. Wird getrennt vom Verfassungstext gespeichert und veröffentlicht.' }} /></p></header> : null}
      {query.saved ? <p role="status"><T value={ui.editor.wiki.targettype.targetid.page.draftSaved} /></p> : null}
      {query.published ? <p role="status"><T value={ui.editor.wiki.targettype.targetid.page.pagePublished} /></p> : null}
      {query.error ? <p role="alert"><T value={ui.editor.wiki.targettype.targetid.page.thePageCouldNotBeSavedOr} /></p> : null}
      {canEdit ? (
        <WikiDraftForm embedded={embedded} action={saveAction} className={styles.form}>
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="jurisdictionId" value={jurisdictionId ?? ''} />
          <input type="hidden" name="targetId" value={targetId} />
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="expectedRevisionId" value={draft?.id ?? ''} />
          <input type="hidden" name="images" value={JSON.stringify(current?.images ?? [])} />
          {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
          <label htmlFor="wiki-summary"><T value={ui.editor.wiki.targettype.targetid.page.shortDescription} /></label>
          <textarea id="wiki-summary" name="summary" maxLength={500} required defaultValue={current?.summary ?? ''} />
          <label htmlFor="wiki-body"><T value={ui.editor.wiki.targettype.targetid.page.pageText} /></label>
          <p className="muted"><T value={ui.editor.wiki.targettype.targetid.page.separateParagraphsWithABlankLineStart} /></p>
          <textarea id="wiki-body" name="body" maxLength={20000} rows={12} defaultValue={current?.body ?? ''} />
          <details className={styles.disclosure}><summary><T value={ui.editor.wiki.targettype.targetid.page.sourceLinksOneUrlPerLine} /></summary><div>
          <label htmlFor="wiki-sources"><T value={ui.editor.wiki.targettype.targetid.page.sourceLinksOneUrlPerLine} /></label>
          <textarea id="wiki-sources" name="sourceUrls" rows={3} defaultValue={(current?.sourceUrls ?? []).join('\n')} />
          </div></details>
          <details className={styles.disclosure}><summary><T value={ui.editor.wiki.targettype.targetid.page.pictures} />{current?.images.length ? ` (${current.images.length})` : ''}</summary><div>
          {current?.images.map((image, index) => (
            <Stack as="fieldset" key={image.documentId}>
              <legend><T value={ui.editor.wiki.targettype.targetid.page.picture} />{" "}{index + 1}</legend>
              <WikiImages images={[image]} preview />
              <label htmlFor={`replace-${image.documentId}`}><T value={ui.editor.wiki.targettype.targetid.page.replacePictureFile} /></label>
              <input id={`replace-${image.documentId}`} type="file" name={`replace-${image.documentId}`} accept="image/jpeg,image/png,image/gif,image/webp,image/avif" />
              <label htmlFor={`order-${image.documentId}`}><T value={ui.editor.wiki.targettype.targetid.page.order} /></label>
              <input id={`order-${image.documentId}`} type="number" min={1} max={30} name={`order-${image.documentId}`} defaultValue={index + 1} />
              <label htmlFor={`placement-${image.documentId}`}><T value={ui.editor.wiki.targettype.targetid.page.placement} /></label>
              <select id={`placement-${image.documentId}`} name={`placement-${image.documentId}`} defaultValue={image.placement ?? 'after_body'}>
                <option value="before_body"><T value={ui.editor.wiki.targettype.targetid.page.beforePageText} /></option>
                <option value="after_body"><T value={ui.editor.wiki.targettype.targetid.page.afterPageText} /></option>
              </select>
              <label htmlFor={`alt-${image.documentId}`}><T value={ui.editor.wiki.targettype.targetid.page.pictureDescription} /></label>
              <input id={`alt-${image.documentId}`} name={`alt-${image.documentId}`} maxLength={500} required defaultValue={image.alt} />
              <label htmlFor={`caption-${image.documentId}`}><T value={ui.editor.wiki.targettype.targetid.page.caption} /></label>
              <input id={`caption-${image.documentId}`} name={`caption-${image.documentId}`} maxLength={1000} defaultValue={image.caption ?? ''} />
              <label htmlFor={`credit-${image.documentId}`}><T value={ui.editor.wiki.targettype.targetid.page.credit} /></label>
              <input id={`credit-${image.documentId}`} name={`credit-${image.documentId}`} maxLength={500} defaultValue={image.credit ?? ''} />
              <label htmlFor={`rights-${image.documentId}`}><T value={ui.editor.wiki.targettype.targetid.page.rights} /></label>
              <input id={`rights-${image.documentId}`} name={`rights-${image.documentId}`} maxLength={500} defaultValue={image.rights ?? ''} />
              <label htmlFor={`source-${image.documentId}`}><T value={ui.editor.wiki.targettype.targetid.page.sourceUrl} /></label>
              <input id={`source-${image.documentId}`} type="url" name={`source-${image.documentId}`} defaultValue={image.sourceUrl ?? ''} />
              <label><input type="checkbox" name={`remove-${image.documentId}`} /> <T value={ui.editor.wiki.targettype.targetid.page.removePicture} /></label>
            </Stack>
          ))}
          <label htmlFor="wiki-image"><T value={ui.editor.wiki.targettype.targetid.page.addAPicture} /></label>
          <input id="wiki-image" type="file" name="imageFile" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" />
          <label htmlFor="wiki-image-order"><T value={ui.editor.wiki.targettype.targetid.page.positionForNewPicture} /></label>
          <input id="wiki-image-order" type="number" min={1} max={30} name="imageOrder" defaultValue={(current?.images.length ?? 0) + 1} />
          <label htmlFor="wiki-image-placement"><T value={ui.editor.wiki.targettype.targetid.page.placementForNewPicture} /></label>
          <select id="wiki-image-placement" name="imagePlacement" defaultValue="after_body"><option value="before_body"><T value={ui.editor.wiki.targettype.targetid.page.beforePageText} /></option><option value="after_body"><T value={ui.editor.wiki.targettype.targetid.page.afterPageText} /></option></select>
          <label htmlFor="wiki-image-alt"><T value={ui.editor.wiki.targettype.targetid.page.pictureDescriptionForScreenReaders} /></label>
          <input id="wiki-image-alt" name="imageAlt" maxLength={500} />
          <label htmlFor="wiki-image-caption"><T value={ui.editor.wiki.targettype.targetid.page.caption} /></label>
          <input id="wiki-image-caption" name="imageCaption" maxLength={1000} />
          <label htmlFor="wiki-image-credit"><T value={ui.editor.wiki.targettype.targetid.page.credit} /></label>
          <input id="wiki-image-credit" name="imageCredit" maxLength={500} />
          <label htmlFor="wiki-image-rights"><T value={ui.editor.wiki.targettype.targetid.page.rights} /></label>
          <input id="wiki-image-rights" name="imageRights" maxLength={500} />
          <label htmlFor="wiki-image-source"><T value={ui.editor.wiki.targettype.targetid.page.sourceUrl} /></label>
          <input id="wiki-image-source" name="imageSource" type="url" />
          </div></details>
          <button className="btn" type="submit"><T value={{ en: 'Save Wiki draft', de: 'Wiki-Entwurf speichern' }} /></button>
        </WikiDraftForm>
      ) : null}
      {canPublish && draft && draft.id !== published?.id ? (
        <WikiDraftForm embedded={embedded} action={publishAction} className={styles.form}>
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="jurisdictionId" value={jurisdictionId ?? ''} />
          <input type="hidden" name="targetId" value={targetId} />
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="revisionId" value={draft.id} />
          {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
          {draftPreview}
          <button className="btn" type="submit"><T value={ui.editor.wiki.targettype.targetid.page.publishPage} /></button>
        </WikiDraftForm>
      ) : null}
      {canReview && !canPublish && draftPreview ? <section>{draftPreview}</section> : null}
      {history.length > 0 || historyPage > 0 ? (
        <details className={styles.disclosure} aria-label={message(locale, ui.accessibility.pageRevisionHistory)}>
          <summary><T value={ui.editor.wiki.targettype.targetid.page.pageRevisionHistory} /></summary><div>
          {history.length === 0 ? <p><T value={ui.editor.wiki.targettype.targetid.page.noRevisionsOnThisPage} /></p> : null}
          <Stack as="ol">
            {history.slice(0, 25).map((revision) => (
              <li key={revision.id}>
                <details>
                  <summary>{revision.createdAt?.slice(0, 10) ?? message(locale, ui.remainingStatus.dateNotRecorded)} · {message(locale, revision.publishedAt ? ui.remainingStatus.published : ui.remainingStatus.draft)} · {revision.createdBy?.slice(0, 8) ?? message(locale, ui.remainingStatus.unknownEditor)} · {revision.summary}</summary>
                  <WikiContent page={revision} preview />
                </details>
              </li>
            ))}
          </Stack>
          <nav className="setting-inline" aria-label={message(locale, ui.accessibility.pageRevisionHistoryPages)}>
            {historyPage > 0 ? <a href={historyHref(historyPage - 1)}><T value={ui.editor.wiki.targettype.targetid.page.newerRevisions} /></a> : null}
            {history.length > 25 ? <a href={historyHref(historyPage + 1)}><T value={ui.editor.wiki.targettype.targetid.page.olderRevisions} /></a> : null}
          </nav>
        </div></details>
      ) : null}
    </section>;
  return embedded ? body : <WorkspacePage width="content" header={<PageHeader title={title} actions={<a className="btn btn-sm" href={publicHref}><T value={ui.editor.wiki.targettype.targetid.page.viewPublicPage} /></a>} />}>{body}</WorkspacePage>;
}
