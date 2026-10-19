import { reviewUi } from '../../../../lib/ui-review-messages';
import { Disclosure } from '../../../components/Disclosure';
import { NavigatingActionForm } from '../../../components/NavigatingActionForm';
import { T } from '../../../components/TranslationProvider';
import { ui } from '../../../../lib/messages';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Alert, PageHeader } from '../../../components/ui';
import { PageMain } from '../../../components/PageMain';
import { getDocument, listDocumentEvents, listDocumentRevisions } from '../../../../lib/document-api';
import { canVisitEditor } from '../../../../lib/nav';
import { currentUser, requireSessionBearer } from '../../../../lib/session';
import { reviseDocumentAction, uploadDocumentAction } from '../actions';

export default async function DocumentDetailPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; saved?: string; error?: string; returnTo?: string }> }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!canVisitEditor(user.roles)) redirect('/editor');
  const { id } = await props.params;
  const params = await props.searchParams;
  const authorization = await requireSessionBearer();
  const [document, revisions, events] = await Promise.all([
    getDocument(id, undefined, authorization), listDocumentRevisions(id, authorization), listDocumentEvents(id, authorization),
  ]);
  const writable = user.roles.some((role) => ['editor', 'publisher', 'admin'].includes(role)) && document.status === 'active';
  return <PageMain className="wide">
    <PageHeader title={document.revision.title} breadcrumbs={[{ href: '/editor/documents', label: <T value={ui.nav.documents} /> }, { label: document.revision.title }]} meta={<><T value={ui.remainingStatus.revision} /> {document.currentRevision} · <T value={document.status === 'active' ? ui.remainingStatus.active : ui.remainingStatus.archived} /></>} />
    {params.created ? <Alert tone="success"><T value={ui.editor.documents.id.page.documentCreatedYouCanAttachItFrom} /></Alert> : null}
    {params.saved ? <Alert tone="success"><T value={ui.editor.documents.id.page.documentRevisionSaved} /></Alert> : null}
    {params.error ? <Alert tone="error"><T value={ui.editor.documents.id.page.theDocumentCouldNotBeSavedReload} /></Alert> : null}
    {params.returnTo ? <p><Link href={params.returnTo}><T value={ui.editor.documents.id.page.returnToEditor} /></Link></p> : null}
    {document.revision.sourceUrl ? <p><a href={document.revision.sourceUrl} rel="noreferrer"><T value={ui.editor.documents.id.page.source} /></a></p> : null}
    {document.revision.fileName ? <p><a href={`/editor/documents/${id}/revisions/${document.currentRevision}/file`}><T value={ui.editor.documents.id.page.download} />{" "}{document.revision.fileName}</a></p> : null}
    {writable ? <div className="form-row">
      <NavigatingActionForm action={reviseDocumentAction} className="stack card">
        <h2><T value={reviewUi.editDocument} /></h2>
        <input type="hidden" name="id" value={id} /><input type="hidden" name="expectedRevision" value={document.currentRevision} />
        <label htmlFor="document-title"><T value={ui.editor.documents.id.page.title} /></label><input id="document-title" name="title" defaultValue={document.revision.title} required maxLength={500} />
        <label htmlFor="document-description"><T value={ui.editor.documents.id.page.description} /></label><textarea id="document-description" name="description" defaultValue={document.revision.description ?? ''} />
        <label htmlFor="document-source"><T value={ui.editor.documents.id.page.sourceUrl} /></label><input id="document-source" name="sourceUrl" type="url" defaultValue={document.revision.sourceUrl ?? ''} />
        <button><T value={ui.editor.documents.id.page.saveRevision} /></button>
      </NavigatingActionForm>
      <NavigatingActionForm action={uploadDocumentAction} className="stack card">
        <h2><T value={reviewUi.replaceFile} /></h2>
        <input type="hidden" name="id" value={id} /><input type="hidden" name="expectedRevision" value={document.currentRevision} />
        <label htmlFor="document-file"><T value={ui.editor.documents.id.page.pdfOrTextFileUpTo20} /></label><input id="document-file" name="file" type="file" accept="application/pdf,text/plain" required />
        <button><T value={ui.editor.documents.id.page.uploadFile} /></button>
      </NavigatingActionForm>
    </div> : null}
    <Disclosure summary={<T value={reviewUi.documentDetails} />}>
    <h2><T value={ui.editor.documents.id.page.revisionHistory} /></h2>
    <ol>{revisions.map((revision) => <li key={revision.id}>
      <Link href={`/documents/${id}?revision=${revision.revision}`}><T value={ui.editor.documents.id.page.revision} />{" "}{revision.revision}: {revision.title}</Link> · {new Date(revision.createdAt).toLocaleString('en')}
      {revision.fileName ? <> · <a href={`/api/document/documents/${id}/revisions/${revision.revision}/file`}><T value={ui.editor.documents.id.page.downloadFile} /></a></> : null}
    </li>)}</ol>
    <h2><T value={ui.editor.documents.id.page.lifecycle} /></h2><ol>{events.map((event) => <li key={event.id}>{event.eventType} · {new Date(event.occurredAt).toLocaleString('en')}</li>)}</ol>
    </Disclosure>
  </PageMain>;
}
