import { NavigatingActionForm } from '../../../../components/NavigatingActionForm';
import { currentLocale } from '../../../../../lib/server-locale';
import { message } from '../../../../../lib/messages';
import { T } from '../../../../components/TranslationProvider';
import { ui } from '../../../../../lib/messages';
import { notFound, redirect } from 'next/navigation';
import { PageMain } from '../../../../components/PageMain';
import { PageHeader } from '../../../../components/ui';
import { WikiSources } from '../../../../components/WikiSources';
import { WikiImages } from '../../../../components/WikiImages';
import { WikiBody } from '../../../../components/WikiBody';
import { getWikiDraft, getWikiHistory, getWikiPage } from '../../../../../lib/api';
import { currentUser, requireSessionBearer } from '../../../../../lib/session';
import { publishWikiAction, saveWikiAction } from '../../actions';

type Props = {
  params: Promise<{ targetType: string; targetId: string }>;
  searchParams: Promise<{ code?: string; saved?: string; published?: string; error?: string; historyPage?: string }>;
};

export default async function WikiEditor({ params, searchParams }: Props) {
  const locale = await currentLocale();
  const { targetType, targetId } = await params;
  const query = await searchParams;
  const historyPage = Math.max(0, Math.min(1000, Number.parseInt(query.historyPage ?? '0', 10) || 0));
  if (targetType !== 'country' && targetType !== 'constitution') notFound();
  const user = await currentUser();
  if (!user) redirect('/login');
  const canEdit = user.roles.some((role) => role === 'editor' || role === 'admin');
  const canPublish = user.roles.some((role) => role === 'publisher' || role === 'admin');
  if (!canEdit && !canPublish) notFound();
  const authorization = await requireSessionBearer();
  const [draft, published, history] = await Promise.all([
    getWikiDraft(targetType, targetId, authorization),
    getWikiPage(targetType, targetId),
    getWikiHistory(targetType, targetId, authorization, historyPage),
  ]);
  const current = draft ?? published;
  const code = query.code ?? '';
  const publicHref = targetType === 'country'
    ? `/countries/${code}`
    : `/countries/${code}/constitutions/${targetId}`;

  return (
    <PageMain className="wide">
      <PageHeader title={`Edit ${targetType} page`} actions={<a className="btn btn-sm" href={publicHref}><T value={ui.editor.wiki.targettype.targetid.page.viewPublicPage} /></a>} />
      {query.saved ? <p role="status"><T value={ui.editor.wiki.targettype.targetid.page.draftSaved} /></p> : null}
      {query.published ? <p role="status"><T value={ui.editor.wiki.targettype.targetid.page.pagePublished} /></p> : null}
      {query.error ? <p role="alert"><T value={ui.editor.wiki.targettype.targetid.page.thePageCouldNotBeSavedOr} /></p> : null}
      {canEdit ? (
        <NavigatingActionForm action={saveWikiAction} className="card">
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="expectedRevisionId" value={draft?.id ?? ''} />
          <input type="hidden" name="images" value={JSON.stringify(current?.images ?? [])} />
          <label htmlFor="wiki-summary"><T value={ui.editor.wiki.targettype.targetid.page.shortDescription} /></label>
          <textarea id="wiki-summary" name="summary" maxLength={500} required defaultValue={current?.summary ?? ''} />
          <label htmlFor="wiki-body"><T value={ui.editor.wiki.targettype.targetid.page.pageText} /></label>
          <p className="muted"><T value={ui.editor.wiki.targettype.targetid.page.separateParagraphsWithABlankLineStart} /></p>
          <textarea id="wiki-body" name="body" maxLength={20000} rows={12} defaultValue={current?.body ?? ''} />
          <label htmlFor="wiki-sources"><T value={ui.editor.wiki.targettype.targetid.page.sourceLinksOneUrlPerLine} /></label>
          <textarea id="wiki-sources" name="sourceUrls" rows={3} defaultValue={(current?.sourceUrls ?? []).join('\n')} />
          <h2><T value={ui.editor.wiki.targettype.targetid.page.pictures} /></h2>
          {current?.images.map((image, index) => (
            <fieldset key={image.documentId}>
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
            </fieldset>
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
          <button className="btn" type="submit"><T value={ui.editor.wiki.targettype.targetid.page.saveDraft} /></button>
        </NavigatingActionForm>
      ) : null}
      {canPublish && draft && draft.id !== published?.id ? (
        <NavigatingActionForm action={publishWikiAction} className="card">
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="revisionId" value={draft.id} />
          <h2><T value={ui.editor.wiki.targettype.targetid.page.reviewDraft} /></h2>
          <p>{draft.summary}</p>
          <WikiImages images={draft.images.filter((image) => image.placement === 'before_body')} preview />
          <WikiBody body={draft.body} />
          <WikiImages images={draft.images.filter((image) => image.placement !== 'before_body')} preview />
          <WikiSources sourceUrls={draft.sourceUrls ?? []} />
          <button className="btn" type="submit"><T value={ui.editor.wiki.targettype.targetid.page.publishPage} /></button>
        </NavigatingActionForm>
      ) : null}
      {history.length > 0 || historyPage > 0 ? (
        <section className="card" aria-label={message(locale, ui.accessibility.pageRevisionHistory)}>
          <h2><T value={ui.editor.wiki.targettype.targetid.page.pageRevisionHistory} /></h2>
          {history.length === 0 ? <p><T value={ui.editor.wiki.targettype.targetid.page.noRevisionsOnThisPage} /></p> : null}
          <ol className="stack">
            {history.slice(0, 25).map((revision) => (
              <li key={revision.id}>
                <details>
                  <summary>{revision.createdAt?.slice(0, 10) ?? message(locale, ui.remainingStatus.dateNotRecorded)} · {message(locale, revision.publishedAt ? ui.remainingStatus.published : ui.remainingStatus.draft)} · {revision.createdBy?.slice(0, 8) ?? message(locale, ui.remainingStatus.unknownEditor)} · {revision.summary}</summary>
                  <p>{revision.summary}</p>
                  <WikiImages images={revision.images.filter((image) => image.placement === 'before_body')} preview />
                  <WikiBody body={revision.body} />
                  <WikiImages images={revision.images.filter((image) => image.placement !== 'before_body')} preview />
                  <WikiSources sourceUrls={revision.sourceUrls ?? []} />
                </details>
              </li>
            ))}
          </ol>
          <nav className="setting-inline" aria-label={message(locale, ui.accessibility.pageRevisionHistoryPages)}>
            {historyPage > 0 ? <a href={`?code=${encodeURIComponent(code)}&historyPage=${historyPage - 1}`}><T value={ui.editor.wiki.targettype.targetid.page.newerRevisions} /></a> : null}
            {history.length > 25 ? <a href={`?code=${encodeURIComponent(code)}&historyPage=${historyPage + 1}`}><T value={ui.editor.wiki.targettype.targetid.page.olderRevisions} /></a> : null}
          </nav>
        </section>
      ) : null}
    </PageMain>
  );
}
