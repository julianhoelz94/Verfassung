import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Alert, PageHeader } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { listDocuments } from '../../../lib/document-api';
import { canVisitEditor } from '../../../lib/nav';
import { currentUser, requireSessionBearer } from '../../../lib/session';

export default async function DocumentsPage(props: { searchParams: Promise<{ q?: string; error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!canVisitEditor(user.roles)) redirect('/editor');
  const params = await props.searchParams;
  const documents = await listDocuments(params.q, await requireSessionBearer());
  return <PageMain className="wide">
    <PageHeader title={<T value={ui.attrs.editorDocumentsPagePageHeaderTitleDocuments} />} meta={<T value={ui.attrs.editorDocumentsPagePageHeaderMetaSources} />} actions={<Link className="btn" href="/editor/documents/new"><T value={ui.editor.documents.page.newDocument} /></Link>} />
    {params.error ? <Alert tone="error"><T value={ui.editor.documents.page.documentActionWasNotAllowed} /></Alert> : null}
    <form method="get" className="form-row"><label htmlFor="document-search"><T value={ui.editor.documents.page.searchDocuments} /></label><input id="document-search" name="q" defaultValue={params.q ?? ''} /><button><T value={ui.editor.documents.page.search} /></button></form>
    <ul className="link-list">{documents.map((document) => <li key={document.id}>
      <Link href={`/editor/documents/${document.id}`}>{document.revision.title}</Link> <T value={ui.editor.documents.page.revision} />{" "}{document.currentRevision} · {document.status}
    </li>)}</ul>
    {documents.length === 0 ? <p><T value={ui.editor.documents.page.noDocumentsFound} /></p> : null}
  </PageMain>;
}
