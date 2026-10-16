import { T, ui } from '../../../components/TranslationProvider';
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
      <PageHeader title={`${title} bearbeiten`} meta={<T value={ui.attrs.adminLegalKeyPagePageHeaderMeta} />} />
      {message.error ? <Alert tone="error"><T value={ui.admin.legal.key.page.theLegalPageCouldNotBeSaved} /></Alert> : null}
      {message.saved ? <Alert tone="info"><T value={ui.admin.legal.key.page.draftSavedThePublicPageHasNot} /></Alert> : null}
      {message.published ? <Alert tone="info"><T value={ui.admin.legal.key.page.publishedRevisionUpdated} /></Alert> : null}
      <Card>
        <form action={saveLegalDraftAction} className="stack">
          <input type="hidden" name="key" value={key} />
          <input type="hidden" name="expectedRevision" value={state?.draft?.revision ?? 0} />
          <label htmlFor="legal-content">{title} <T value={ui.admin.legal.key.page.text} /></label>
          <textarea id="legal-content" name="content" rows={18} maxLength={30000} required defaultValue={state?.draft?.content ?? exampleLegalPage(key as LegalPageKey)} />
          <p className="muted"><T value={ui.admin.legal.key.page.theInitialExampleUsesFictionalDetailsReplace} /></p>
          <Button variant="primary"><T value={ui.admin.legal.key.page.saveDraft} /></Button>
        </form>
      </Card>
      <Card>
        <h2><T value={ui.admin.legal.key.page.publication} /></h2>
        <p><T value={ui.admin.legal.key.page.publishedRevision} />{" "}{state?.published?.revision ?? 'none'}<T value={ui.admin.legal.key.page.draftRevision} />{" "}{state?.draft?.revision ?? 'none'}.</p>
        {state?.draft ? (
          <form action={publishLegalPageAction}>
            <input type="hidden" name="key" value={key} />
            <input type="hidden" name="expectedRevision" value={state.draft.revision} />
            <Button variant="primary"><T value={ui.admin.legal.key.page.publishReviewedText} /></Button>
          </form>
        ) : null}
      </Card>
      {revisions.length > 0 ? (
        <Card>
          <h2><T value={ui.admin.legal.key.page.revisionHistory} /></h2>
          <ul>
            {revisions.map((revision) => (
              <li key={revision.revision}>
                <details>
                  <summary><T value={ui.admin.legal.key.page.revision} />{" "}{revision.revision} · {new Date(revision.createdAt).toLocaleString('de-DE')}{state?.published?.revision === revision.revision ? ' · published' : ''}</summary>
                  <pre className="legal-page-content">{revision.content}</pre>
                  <form action={saveLegalDraftAction}>
                    <input type="hidden" name="key" value={key} />
                    <input type="hidden" name="expectedRevision" value={state?.draft?.revision ?? 0} />
                    <input type="hidden" name="content" value={revision.content} />
                    <Button><T value={ui.admin.legal.key.page.restoreAsNewDraft} /></Button>
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
