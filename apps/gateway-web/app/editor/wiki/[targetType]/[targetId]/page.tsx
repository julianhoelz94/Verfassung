import { notFound, redirect } from 'next/navigation';
import { PageMain } from '../../../../components/PageMain';
import { PageHeader } from '../../../../components/ui';
import { getWikiDraft, getWikiPage } from '../../../../../lib/api';
import { currentUser, requireSessionBearer } from '../../../../../lib/session';
import { publishWikiAction, saveWikiAction } from '../../actions';

type Props = {
  params: Promise<{ targetType: string; targetId: string }>;
  searchParams: Promise<{ code?: string; saved?: string; published?: string; error?: string }>;
};

export default async function WikiEditor({ params, searchParams }: Props) {
  const { targetType, targetId } = await params;
  const query = await searchParams;
  if (targetType !== 'country' && targetType !== 'constitution') notFound();
  const user = await currentUser();
  if (!user) redirect('/login');
  const canEdit = user.roles.some((role) => role === 'editor' || role === 'admin');
  const canPublish = user.roles.some((role) => role === 'publisher' || role === 'admin');
  if (!canEdit && !canPublish) notFound();
  const authorization = await requireSessionBearer();
  const [draft, published] = await Promise.all([
    getWikiDraft(targetType, targetId, authorization),
    getWikiPage(targetType, targetId),
  ]);
  const current = draft ?? published;
  const code = query.code ?? '';
  const publicHref = targetType === 'country'
    ? `/countries/${code}`
    : `/countries/${code}/constitutions/${targetId}`;

  return (
    <PageMain className="wide">
      <PageHeader title={`Edit ${targetType} page`} actions={<a className="btn btn-sm" href={publicHref}>View public page</a>} />
      {query.saved ? <p role="status">Draft saved.</p> : null}
      {query.published ? <p role="status">Page published.</p> : null}
      {query.error ? <p role="alert">The page could not be saved or published. Reload and try again.</p> : null}
      {canEdit ? (
        <form action={saveWikiAction} className="card">
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="expectedRevisionId" value={draft?.id ?? ''} />
          <input type="hidden" name="images" value={JSON.stringify(current?.images ?? [])} />
          <label htmlFor="wiki-summary">Short description</label>
          <textarea id="wiki-summary" name="summary" maxLength={500} required defaultValue={current?.summary ?? ''} />
          <label htmlFor="wiki-body">Page text</label>
          <textarea id="wiki-body" name="body" maxLength={20000} rows={12} defaultValue={current?.body ?? ''} />
          <h2>Pictures</h2>
          {current?.images.map((image, index) => (
            <fieldset key={image.documentId}>
              <legend>Picture {index + 1}</legend>
              <label htmlFor={`order-${image.documentId}`}>Order</label>
              <input id={`order-${image.documentId}`} type="number" min={1} max={30} name={`order-${image.documentId}`} defaultValue={index + 1} />
              <label htmlFor={`alt-${image.documentId}`}>Picture description</label>
              <input id={`alt-${image.documentId}`} name={`alt-${image.documentId}`} maxLength={500} required defaultValue={image.alt} />
              <label htmlFor={`caption-${image.documentId}`}>Caption</label>
              <input id={`caption-${image.documentId}`} name={`caption-${image.documentId}`} maxLength={1000} defaultValue={image.caption ?? ''} />
              <label htmlFor={`credit-${image.documentId}`}>Credit</label>
              <input id={`credit-${image.documentId}`} name={`credit-${image.documentId}`} maxLength={500} defaultValue={image.credit ?? ''} />
              <label htmlFor={`rights-${image.documentId}`}>Rights</label>
              <input id={`rights-${image.documentId}`} name={`rights-${image.documentId}`} maxLength={500} defaultValue={image.rights ?? ''} />
              <label htmlFor={`source-${image.documentId}`}>Source URL</label>
              <input id={`source-${image.documentId}`} type="url" name={`source-${image.documentId}`} defaultValue={image.sourceUrl ?? ''} />
              <label><input type="checkbox" name={`remove-${image.documentId}`} /> Remove picture</label>
            </fieldset>
          ))}
          <label htmlFor="wiki-image">Add a picture</label>
          <input id="wiki-image" type="file" name="imageFile" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" />
          <label htmlFor="wiki-image-alt">Picture description for screen readers</label>
          <input id="wiki-image-alt" name="imageAlt" maxLength={500} />
          <label htmlFor="wiki-image-caption">Caption</label>
          <input id="wiki-image-caption" name="imageCaption" maxLength={1000} />
          <label htmlFor="wiki-image-credit">Credit</label>
          <input id="wiki-image-credit" name="imageCredit" maxLength={500} />
          <label htmlFor="wiki-image-rights">Rights</label>
          <input id="wiki-image-rights" name="imageRights" maxLength={500} />
          <label htmlFor="wiki-image-source">Source URL</label>
          <input id="wiki-image-source" name="imageSource" type="url" />
          <button className="btn" type="submit">Save draft</button>
        </form>
      ) : null}
      {canPublish && draft && draft.id !== published?.id ? (
        <form action={publishWikiAction} className="card">
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="revisionId" value={draft.id} />
          <h2>Review draft</h2>
          <p>{draft.summary}</p>
          {draft.body ? <p className="wiki-body">{draft.body}</p> : null}
          <button className="btn" type="submit">Publish page</button>
        </form>
      ) : null}
    </PageMain>
  );
}
