import { AdminForbidden } from '../../../components/AdminForbidden';
import { PageMain } from '../../../components/PageMain';
import { Alert, Button, Card, PageHeader } from '../../../components/ui';
import { requireAdminPage } from '../../../../lib/admin';
import { requireSessionBearer } from '../../../../lib/session';
import { adminLegalPage, adminLegalPageRevisions, type LegalPageKey } from '../../../../lib/legal-pages';
import { exampleLegalPage } from '../../../../lib/legal-page-examples';
import { publishLegalPageAction, saveLegalDraftAction } from './actions';
import { notFound } from 'next/navigation';

export default async function AdminLegalPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ error?: string; saved?: string; published?: string }>;
}) {
  const { key } = await params;
  if (key !== 'impressum' && key !== 'datenschutz') notFound();
  if (!(await requireAdminPage())) return <AdminForbidden title="Legal pages" />;
  const bearer = await requireSessionBearer();
  const state = await adminLegalPage(key as LegalPageKey, bearer);
  const revisions = await adminLegalPageRevisions(key as LegalPageKey, bearer);
  const message = await searchParams;
  const title = key === 'impressum' ? 'Impressum' : 'Datenschutzerklärung';
  return (
    <PageMain>
      <PageHeader title={`${title} bearbeiten`} meta="Save a private draft, review it, then publish it separately." />
      {message.error ? <Alert tone="error">The legal page could not be saved or published. Reload and try again.</Alert> : null}
      {message.saved ? <Alert tone="info">Draft saved. The public page has not changed.</Alert> : null}
      {message.published ? <Alert tone="info">Published revision updated.</Alert> : null}
      <Card>
        <form action={saveLegalDraftAction} className="stack">
          <input type="hidden" name="key" value={key} />
          <input type="hidden" name="expectedRevision" value={state?.draft?.revision ?? 0} />
          <label htmlFor="legal-content">{title} text</label>
          <textarea id="legal-content" name="content" rows={18} maxLength={30000} required defaultValue={state?.draft?.content ?? exampleLegalPage(key as LegalPageKey)} />
          <p className="muted">The initial example uses fictional details. Replace and verify all operator facts, contact details, and processing claims before publication. Plain text only.</p>
          <Button variant="primary">Save draft</Button>
        </form>
      </Card>
      <Card>
        <h2>Publication</h2>
        <p>Published revision: {state?.published?.revision ?? 'none'}. Draft revision: {state?.draft?.revision ?? 'none'}.</p>
        {state?.draft ? (
          <form action={publishLegalPageAction}>
            <input type="hidden" name="key" value={key} />
            <input type="hidden" name="expectedRevision" value={state.draft.revision} />
            <Button variant="primary">Publish reviewed text</Button>
          </form>
        ) : null}
      </Card>
      {revisions.length > 0 ? (
        <Card>
          <h2>Revision history</h2>
          <ul>
            {revisions.map((revision) => (
              <li key={revision.revision}>
                <details>
                  <summary>Revision {revision.revision} · {new Date(revision.createdAt).toLocaleString('de-DE')}{state?.published?.revision === revision.revision ? ' · published' : ''}</summary>
                  <pre className="legal-page-content">{revision.content}</pre>
                  <form action={saveLegalDraftAction}>
                    <input type="hidden" name="key" value={key} />
                    <input type="hidden" name="expectedRevision" value={state?.draft?.revision ?? 0} />
                    <input type="hidden" name="content" value={revision.content} />
                    <Button>Restore as new draft</Button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </PageMain>
  );
}
