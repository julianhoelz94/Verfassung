import { T } from '../../../components/TranslationProvider';
import { ui } from '../../../../lib/messages';
import { AdminForbidden } from '../../../components/AdminForbidden';
import { PageMain } from '../../../components/PageMain';
import { Alert, Button, Card, PageHeader } from '../../../components/ui';
import { requireAdminPage } from '../../../../lib/admin';
import { requireSessionBearer } from '../../../../lib/session';
import { adminImprintDetails, adminLegalPage, adminLegalPageRevisions, type LegalPageKey } from '../../../../lib/legal-pages';
import { exampleLegalPage } from '../../../../lib/legal-page-examples';
import { publishLegalPageAction, saveLegalDraftAction, saveImprintDetailsAction, publishImprintDetailsAction } from './actions';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { currentLocale } from '../../../../lib/server-locale';
import { message } from '../../../../lib/messages';

export default async function AdminLegalPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ error?: string; saved?: string; published?: string }>;
}) {
  const { key } = await params;
  if (!['impressum', 'datenschutz', 'impressum_en', 'datenschutz_en'].includes(key)) notFound();
  if (!(await requireAdminPage())) return <AdminForbidden title={ui.forbidden.legalPages} />;
  const bearer = await requireSessionBearer();
  const state = await adminLegalPage(key as LegalPageKey, bearer);
  const revisions = await adminLegalPageRevisions(key as LegalPageKey, bearer);
  const imprintDetails = key === 'impressum' ? await adminImprintDetails(bearer) : null;
  const paramsMessage = await searchParams;
  const locale = await currentLocale();
  const title = message(locale, key.startsWith('impressum') ? ui.legal.imprint : ui.legal.privacyNotice);
  return (
    <PageMain>
      <PageHeader title={<T value={key.startsWith('impressum') ? ui.legal.editImprint : ui.legal.editPrivacyNotice} />} meta={<T value={ui.attrs.adminLegalKeyPagePageHeaderMeta} />} />
      <nav className="inline-actions" aria-label={title}>
        <Link href={`/admin/legal/${key.startsWith('impressum') ? 'impressum' : 'datenschutz'}`}><T value={ui.legal.germanVersion} /></Link>
        <Link href={`/admin/legal/${key.startsWith('impressum') ? 'impressum_en' : 'datenschutz_en'}`}><T value={ui.legal.englishVersion} /></Link>
      </nav>
      {paramsMessage.error ? <Alert tone="error"><T value={ui.admin.legal.key.page.theLegalPageCouldNotBeSaved} /></Alert> : null}
      {paramsMessage.saved ? <Alert tone="info"><T value={ui.admin.legal.key.page.draftSavedThePublicPageHasNot} /></Alert> : null}
      {paramsMessage.published ? <Alert tone="info"><T value={ui.admin.legal.key.page.publishedRevisionUpdated} /></Alert> : null}
      {key.startsWith('impressum') && state?.published && !state.published.separateContact ? <Alert tone="info"><T value={ui.remainingStatus.legacyImprint} /></Alert> : null}
      <Card>
        <form action={saveLegalDraftAction} className="stack">
          <input type="hidden" name="key" value={key} />
          <input type="hidden" name="expectedRevision" value={state?.draft?.revision ?? 0} />
          <label htmlFor="legal-content">{title} <T value={ui.admin.legal.key.page.text} /></label>
          <textarea id="legal-content" name="content" rows={18} maxLength={30000} required defaultValue={state?.draft?.content ?? exampleLegalPage(key as LegalPageKey)} />
          <p className="muted"><T value={ui.admin.legal.key.page.theInitialExampleUsesFictionalDetailsReplace} /></p>
          {key.startsWith('impressum') ? <p className="muted"><T value={ui.remainingStatus.imprintBodyHelp} /></p> : null}
          <Button variant="primary"><T value={ui.admin.legal.key.page.saveDraft} /></Button>
        </form>
      </Card>
      {imprintDetails ? <Card>
        <h2><T value={ui.legal.imprintDetails} /></h2>
        <form action={saveImprintDetailsAction} className="stack">
          <input type="hidden" name="expectedRevision" value={imprintDetails.draft?.revision ?? 0} />
          {(['name', 'streetAddress', 'postalCode', 'city', 'country', 'email'] as const).map((field) => <label key={field}>
            <T value={ui.legal[field]} />
            <input name={field} type={field === 'email' ? 'email' : 'text'} required maxLength={255} defaultValue={imprintDetails.draft?.[field] ?? ''} />
          </label>)}
          <Button variant="primary"><T value={ui.legal.saveDetails} /></Button>
        </form>
        {imprintDetails.draft ? <form action={publishImprintDetailsAction}>
          <input type="hidden" name="expectedRevision" value={imprintDetails.draft.revision} />
          <Button><T value={ui.legal.publishDetails} /></Button>
        </form> : null}
      </Card> : null}
      <Card>
        <h2><T value={ui.admin.legal.key.page.publication} /></h2>
        <p><T value={ui.admin.legal.key.page.publishedRevision} />{" "}{state?.published?.revision ?? message(locale, ui.legal.none)}<T value={ui.admin.legal.key.page.draftRevision} />{" "}{state?.draft?.revision ?? message(locale, ui.legal.none)}.</p>
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
                  <summary><T value={ui.admin.legal.key.page.revision} />{" "}{revision.revision} · {new Date(revision.createdAt).toLocaleString(locale === 'de' ? 'de-DE' : 'en-US')}{state?.published?.revision === revision.revision ? ` · ${message(locale, ui.legal.published)}` : ''}</summary>
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
