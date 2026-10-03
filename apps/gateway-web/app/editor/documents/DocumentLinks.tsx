import Link from 'next/link';
import { listDocumentLinkEvents, listDocumentLinks, listDocumentRevisions, listDocuments } from '../../../lib/document-api';
import { requireSessionBearer } from '../../../lib/session';
import { detachDocumentAction } from './actions';
import { DocumentPicker } from './DocumentPicker';

export async function DocumentLinks(props: {
  targetType: 'constitution' | 'amendment';
  targetId: string;
  returnTo: string;
  canEdit: boolean;
}) {
  const [links, documents, events] = await Promise.all([
    listDocumentLinks(props.targetType, props.targetId),
    props.canEdit ? listDocuments() : Promise.resolve([]),
    listDocumentLinkEvents(props.targetType, props.targetId, await requireSessionBearer()),
  ]);
  const available = documents.filter((document) => document.status === 'active' && !links.some((link) => link.documentId === document.id));
  const revisions = props.canEdit ? await Promise.all(available.map((document) => listDocumentRevisions(document.id))) : [];
  return <section className="card stack">
    <h2>Linked documents</h2>
    {links.length ? <ul className="link-list">{links.map((link) => <li key={link.documentId}>
      <Link href={`/documents/${link.documentId}${link.revisionId ? `?revision=${link.document.revision.revision}` : ''}`}>{link.document.revision.title}</Link>
      {' '}· {link.revisionId ? `Pinned revision ${link.document.revision.revision}` : `Current revision ${link.document.currentRevision}`}
      {' '}<Link href={`/editor/documents/${link.documentId}`}>Inspect history</Link>
      {props.canEdit ? <form action={detachDocumentAction} className="inline-form">
        <input type="hidden" name="targetType" value={props.targetType} /><input type="hidden" name="targetId" value={props.targetId} />
        <input type="hidden" name="documentId" value={link.documentId} /><input type="hidden" name="returnTo" value={props.returnTo} />
        <button type="submit">Detach</button>
      </form> : null}
    </li>)}</ul> : <p>No managed documents linked.</p>}
    {props.canEdit ? <>
      <h3>Attach an existing document</h3>
      <DocumentPicker documents={available} revisions={revisions} targetType={props.targetType} targetId={props.targetId} returnTo={props.returnTo} />
      <p><Link href={`/editor/documents/new?returnTo=${encodeURIComponent(props.returnTo)}`} target="_blank">Create a document in a new tab</Link> to keep this editor open.</p>
    </> : null}
    {events.length ? <details><summary>Link history</summary><ol>{events.map((event) => <li key={event.id}>
      {event.action} · <Link href={`/editor/documents/${event.documentId}`}>{event.documentId}</Link> · {new Date(event.occurredAt).toLocaleString('en')}
    </li>)}</ol></details> : null}
  </section>;
}
