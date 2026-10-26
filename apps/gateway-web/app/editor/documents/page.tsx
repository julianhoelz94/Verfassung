import { loginHref } from '../../../lib/return-to';
import { statusMessage } from '../../../lib/ui-labels';
import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Alert, PageHeader } from '../../components/ui';
import { CollectionPage } from '../../components/layout/templates';
import { listDocuments } from '../../../lib/document-api';
import { canVisitEditor } from '../../../lib/nav';
import { currentUser, requireSessionBearer } from '../../../lib/session';
import { Inline } from '../../components/layout/Layout';

export default async function DocumentsPage(props: { searchParams: Promise<{ q?: string; error?: string }> }) {
  const params = await props.searchParams;
  const user = await currentUser();
  if (!user) redirect(loginHref('/editor/documents', params));
  if (!canVisitEditor(user.roles)) redirect('/editor');
  const documents = await listDocuments(params.q, await requireSessionBearer());
  return <CollectionPage width="content" header={<PageHeader title={<T value={ui.attrs.editorDocumentsPagePageHeaderTitleDocuments} />} meta={<T value={ui.attrs.editorDocumentsPagePageHeaderMetaSources} />} actions={<Link className="btn" href="/editor/documents/new"><T value={ui.editor.documents.page.newDocument} /></Link>} />}>

    {params.error ? <Alert tone="error"><T value={ui.editor.documents.page.documentActionWasNotAllowed} /></Alert> : null}
    <Inline align="end" as="form" method="get" className="form-row"><label htmlFor="document-search"><T value={ui.editor.documents.page.searchDocuments} /></label><input id="document-search" name="q" defaultValue={params.q ?? ''} /><button><T value={ui.editor.documents.page.search} /></button></Inline>
    <ul className="link-list">{documents.map((document) => <li key={document.id}>
      <Link href={`/editor/documents/${document.id}`}>{document.revision.title}</Link> <T value={ui.editor.documents.page.revision} />{" "}{document.currentRevision} · {<T value={statusMessage(document.status)} />}
    </li>)}</ul>
    {documents.length === 0 ? <p><T value={ui.editor.documents.page.noDocumentsFound} /></p> : null}
  </CollectionPage>;
}
