import { NavigatingActionForm } from '../../../components/NavigatingActionForm';
import { T } from '../../../components/TranslationProvider';
import { ui } from '../../../../lib/messages';
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
    <PageHeader title={<T value={ui.attrs.editorDocumentsNewPagePageHeaderTitle} />} breadcrumbs={[{ href: '/editor/documents', label: <T value={ui.nav.documents} /> }, { label: <T value={ui.remainingStatus.new} /> }]} />
    {params.error ? <Alert tone="error"><T value={ui.editor.documents.new.page.documentCouldNotBeCreatedCheckThe} /></Alert> : null}
    <NavigatingActionForm action={createDocumentAction} className="stack">
      <input type="hidden" name="returnTo" value={params.returnTo ?? '/editor/documents'} />
      <label htmlFor="document-title"><T value={ui.editor.documents.new.page.title} /></label><input id="document-title" name="title" required maxLength={500} />
      <label htmlFor="document-description"><T value={ui.editor.documents.new.page.description} /></label><textarea id="document-description" name="description" />
      <label htmlFor="document-source"><T value={ui.editor.documents.new.page.sourceUrl} /></label><input id="document-source" name="sourceUrl" type="url" />
      <div className="action-bar"><button><T value={ui.editor.documents.new.page.createDocument} /></button><Link href={params.returnTo ?? '/editor/documents'}><T value={ui.editor.documents.new.page.returnToEditor} /></Link></div>
    </NavigatingActionForm>
  </PageMain>;
}
