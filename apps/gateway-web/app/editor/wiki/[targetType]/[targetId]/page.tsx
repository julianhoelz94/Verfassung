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
          <p className="muted">Separate paragraphs with a blank line. Start a heading with # or a list item with -.</p>
          <textarea id="wiki-body" name="body" maxLength={20000} rows={12} defaultValue={current?.body ?? ''} />
          <label htmlFor="wiki-sources">Source links (one URL per line)</label>
          <textarea id="wiki-sources" name="sourceUrls" rows={3} defaultValue={(current?.sourceUrls ?? []).join('\n')} />
          <h2>Pictures</h2>
          {current?.images.map((image, index) => (
            <fieldset key={image.documentId}>
              <legend>Picture {index + 1}</legend>
              <WikiImages images={[image]} preview />
              <label htmlFor={`replace-${image.documentId}`}>Replace picture file</label>
              <input id={`replace-${image.documentId}`} type="file" name={`replace-${image.documentId}`} accept="image/jpeg,image/png,image/gif,image/webp,image/avif" />
              <label htmlFor={`order-${image.documentId}`}>Order</label>
              <input id={`order-${image.documentId}`} type="number" min={1} max={30} name={`order-${image.documentId}`} defaultValue={index + 1} />
              <label htmlFor={`placement-${image.documentId}`}>Placement</label>
              <select id={`placement-${image.documentId}`} name={`placement-${image.documentId}`} defaultValue={image.placement ?? 'after_body'}>
                <option value="before_body">Before page text</option>
                <option value="after_body">After page text</option>
              </select>
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
          <label htmlFor="wiki-image-order">Position for new picture</label>
          <input id="wiki-image-order" type="number" min={1} max={30} name="imageOrder" defaultValue={(current?.images.length ?? 0) + 1} />
          <label htmlFor="wiki-image-placement">Placement for new picture</label>
          <select id="wiki-image-placement" name="imagePlacement" defaultValue="after_body"><option value="before_body">Before page text</option><option value="after_body">After page text</option></select>
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
          <WikiImages images={draft.images.filter((image) => image.placement === 'before_body')} preview />
          <WikiBody body={draft.body} />
          <WikiImages images={draft.images.filter((image) => image.placement !== 'before_body')} preview />
          <WikiSources sourceUrls={draft.sourceUrls ?? []} />
          <button className="btn" type="submit">Publish page</button>
        </form>
      ) : null}
      {history.length > 0 || historyPage > 0 ? (
        <section className="card" aria-label="Page revision history">
          <h2>Page revision history</h2>
          {history.length === 0 ? <p>No revisions on this page.</p> : null}
          <ol className="stack">
            {history.slice(0, 25).map((revision) => (
              <li key={revision.id}>
                <details>
                  <summary>{revision.createdAt?.slice(0, 10) ?? 'Date not recorded'} · {revision.publishedAt ? 'Published' : 'Draft'} · {revision.createdBy?.slice(0, 8) ?? 'Unknown editor'} · {revision.summary}</summary>
                  <p>{revision.summary}</p>
                  <WikiImages images={revision.images.filter((image) => image.placement === 'before_body')} preview />
                  <WikiBody body={revision.body} />
                  <WikiImages images={revision.images.filter((image) => image.placement !== 'before_body')} preview />
                  <WikiSources sourceUrls={revision.sourceUrls ?? []} />
                </details>
              </li>
            ))}
          </ol>
          <nav className="setting-inline" aria-label="Page revision history pages">
            {historyPage > 0 ? <a href={`?code=${encodeURIComponent(code)}&historyPage=${historyPage - 1}`}>Newer revisions</a> : null}
            {history.length > 25 ? <a href={`?code=${encodeURIComponent(code)}&historyPage=${historyPage + 1}`}>Older revisions</a> : null}
          </nav>
        </section>
      ) : null}
    </PageMain>
  );
}
