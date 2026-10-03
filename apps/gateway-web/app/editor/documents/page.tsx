import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Alert, PageHeader } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { listDocuments } from '../../../lib/document-api';
import { canVisitEditor } from '../../../lib/nav';
import { currentUser } from '../../../lib/session';

export default async function DocumentsPage(props: { searchParams: Promise<{ q?: string; error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!canVisitEditor(user.roles)) redirect('/editor');
  const params = await props.searchParams;
  const documents = await listDocuments(params.q);
  return <PageMain className="wide">
    <PageHeader title="Documents" meta="Sources, files, and revision history shared across constitutions and legal changes." actions={<Link className="btn" href="/editor/documents/new">New document</Link>} />
    {params.error ? <Alert tone="error">Document action was not allowed.</Alert> : null}
    <form method="get" className="form-row"><label htmlFor="document-search">Search documents</label><input id="document-search" name="q" defaultValue={params.q ?? ''} /><button>Search</button></form>
    <ul className="link-list">{documents.map((document) => <li key={document.id}>
      <Link href={`/editor/documents/${document.id}`}>{document.revision.title}</Link> · revision {document.currentRevision} · {document.status}
    </li>)}</ul>
    {documents.length === 0 ? <p>No documents found.</p> : null}
  </PageMain>;
}
