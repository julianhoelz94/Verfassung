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
    <PageHeader title={document.revision.title} breadcrumbs={[{ href: '/editor/documents', label: 'Documents' }, { label: document.revision.title }]} meta={`Revision ${document.currentRevision} · ${document.status}`} />
    {params.created ? <Alert tone="success">Document created. You can attach it from the editor.</Alert> : null}
    {params.saved ? <Alert tone="success">Document revision saved.</Alert> : null}
    {params.error ? <Alert tone="error">The document could not be saved. Reload to check its latest revision and permissions.</Alert> : null}
    {params.returnTo ? <p><Link href={params.returnTo}>Return to editor</Link></p> : null}
    {document.revision.sourceUrl ? <p><a href={document.revision.sourceUrl} rel="noreferrer">Source</a></p> : null}
    {document.revision.fileName ? <p><a href={`/editor/documents/${id}/revisions/${document.currentRevision}/file`}>Download {document.revision.fileName}</a></p> : null}
    {writable ? <div className="form-row">
      <form action={reviseDocumentAction} className="stack card">
        <h2>New metadata revision</h2>
        <input type="hidden" name="id" value={id} /><input type="hidden" name="expectedRevision" value={document.currentRevision} />
        <label htmlFor="document-title">Title</label><input id="document-title" name="title" defaultValue={document.revision.title} required maxLength={500} />
        <label htmlFor="document-description">Description</label><textarea id="document-description" name="description" defaultValue={document.revision.description ?? ''} />
        <label htmlFor="document-source">Source URL</label><input id="document-source" name="sourceUrl" type="url" defaultValue={document.revision.sourceUrl ?? ''} />
        <button>Save revision</button>
      </form>
      <form action={uploadDocumentAction} className="stack card">
        <h2>Upload a file revision</h2>
        <input type="hidden" name="id" value={id} /><input type="hidden" name="expectedRevision" value={document.currentRevision} />
        <label htmlFor="document-file">PDF or text file, up to 20 MB</label><input id="document-file" name="file" type="file" accept="application/pdf,text/plain" required />
        <button>Upload file</button>
      </form>
    </div> : null}
    <h2>Revision history</h2>
    <ol>{revisions.map((revision) => <li key={revision.id}>
      <Link href={`/documents/${id}?revision=${revision.revision}`}>Revision {revision.revision}: {revision.title}</Link> · {new Date(revision.createdAt).toLocaleString('en')}
      {revision.fileName ? <> · <a href={`/api/document/documents/${id}/revisions/${revision.revision}/file`}>Download file</a></> : null}
    </li>)}</ol>
    <h2>Lifecycle</h2><ol>{events.map((event) => <li key={event.id}>{event.eventType} · {new Date(event.occurredAt).toLocaleString('en')}</li>)}</ol>
  </PageMain>;
}
