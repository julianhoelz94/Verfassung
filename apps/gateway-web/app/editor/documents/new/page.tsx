import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Alert, PageHeader } from '../../../components/ui';
import { PageMain } from '../../../components/PageMain';
import { canVisitEditor } from '../../../../lib/nav';
import { currentUser } from '../../../../lib/session';
import { createDocumentAction } from '../actions';

export default async function NewDocumentPage(props: { searchParams: Promise<{ returnTo?: string; error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!canVisitEditor(user.roles)) redirect('/editor');
  const params = await props.searchParams;
  return <PageMain>
    <PageHeader title="New document" breadcrumbs={[{ href: '/editor/documents', label: 'Documents' }, { label: 'New' }]} />
    {params.error ? <Alert tone="error">Document could not be created. Check the title and source URL.</Alert> : null}
    <form action={createDocumentAction} className="stack">
      <input type="hidden" name="returnTo" value={params.returnTo ?? '/editor/documents'} />
      <label htmlFor="document-title">Title</label><input id="document-title" name="title" required maxLength={500} />
      <label htmlFor="document-description">Description</label><textarea id="document-description" name="description" />
      <label htmlFor="document-source">Source URL</label><input id="document-source" name="sourceUrl" type="url" />
      <div className="action-bar"><button>Create document</button><Link href={params.returnTo ?? '/editor/documents'}>Return to editor</Link></div>
    </form>
  </PageMain>;
}
