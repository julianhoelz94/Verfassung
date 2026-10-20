import { NavigatingActionForm } from '../components/NavigatingActionForm';
import { statusMessage } from '../../lib/ui-labels';
import { T } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import { notFound } from 'next/navigation';
import { AdminForbidden } from '../components/AdminForbidden';
import { Alert, Button, Card, PageHeader, WorkflowSteps } from '../components/ui';
import { WorkspacePage } from '../components/layout/templates';
import { getImportJob, getImportPayload, getPreparedImportContent, getImportReviewDecisions } from '../../lib/ingestion-api';
import { getVersionSettings } from '../../lib/api';
import { OrderedContentTree } from '../components/ConstitutionText';
import { currentUser, requireSessionBearer } from '../../lib/session';
import { transitionImportAction } from '../admin/import/actions';
import { Disclosure } from '../components/Disclosure';
import { reviewUi } from '../../lib/ui-review-messages';
import { ImportPreview } from '../admin/import/ImportPreview';
import fieldStyles from '../components/fields.module.css';

export async function ImportReview({ jobId, error }: { jobId: string; error?: string }) {
  const user = await currentUser();
  if (!user || !user.roles.some(role => ['editor', 'reviewer', 'publisher', 'admin'].includes(role))) {
    return <AdminForbidden title={ui.forbidden.import} />;
  }
  const authorization = await requireSessionBearer();
  let job;
  try {
    job = await getImportJob(jobId, authorization);
  } catch {
    return (
      <WorkspacePage width="reading" header={<PageHeader title={<T value={ui.importReview.title} />} />}>

        <Alert tone="error"><T value={ui.admin.import.jobid.page.theImportServiceIsUnavailable} /></Alert>
      </WorkspacePage>
    );
  }
  if (!job) {
    notFound();
  }
  const [payload, decisions, prepared, settings] = await Promise.all([
    getImportPayload(jobId, authorization).catch(() => null),
    getImportReviewDecisions(jobId, authorization).catch(() => []),
    job.versionId ? getPreparedImportContent(job.versionId, authorization).catch(() => null) : null,
    job.versionId ? getVersionSettings(job.versionId, authorization).catch(() => null) : null,
  ]);
  const editor = user.roles.includes('editor') || user.roles.includes('admin');
  const reviewer = user.roles.includes('reviewer') || user.roles.includes('admin');
  const publisher = user.roles.includes('publisher') || user.roles.includes('admin');
  const versionHref =
    job.status === 'completed' && job.versionId && job.isoCode
      ? `/countries/${encodeURIComponent(job.isoCode)}/versions/${encodeURIComponent(job.versionId)}`
      : null;
  return (
    <WorkspacePage width="content" className="import-review" header={<PageHeader title={<T value={ui.importReview.title} />} eyebrow={<T value={ui.attrs.editorEditorlandingPageHeaderTitleEditor} />} meta={<WorkflowSteps status={job.status === 'pending_review' ? 'reviewing' : job.status === 'completed' ? 'published' : job.status} />} />}>
      <nav className="section-nav">
        <a href="/editor?status=reviewing"><T value={ui.nav.reviewQueue} /></a>
        {publisher ? <a href="/editor?status=approved"><T value={ui.nav.readyToPublish} /></a> : null}
      </nav>

      <p><T value={ui.importActions.status} /> <T value={statusMessage(job.status)} /></p>
      {error ? <Alert tone="error"><T value={error === 'reason' ? ui.importActions.reasonRequired : ui.importActions.actionFailed} /></Alert> : null}
      {job.status === 'pending_review' ? <Alert><T value={ui.admin.import.jobid.page.thisImportIsPendingReviewItIs} /></Alert> : null}
      {job.versionId && !prepared ? <Alert tone="error"><T value={ui.importReview.previewUnavailable} /></Alert> : null}
      {job.status === 'failed' ? <Alert tone="error"><T value={ui.admin.import.jobid.page.theImportFailed} /></Alert> : null}
      {job.status === 'completed' && versionHref ? (
        <Alert tone="success">
          <T value={ui.admin.import.jobid.page.importCompleted} />{' '}
          <a href={versionHref}><T value={ui.admin.import.jobid.page.openThePublishedVersion} /></a>
        </Alert>
      ) : null}
      {payload ? <Card>
        <h2>{String(payload.constitutionTitle ?? '')} · {String(payload.versionLabel ?? '')}</h2>
        <p>{String(payload.countryName ?? job.isoCode ?? '')}</p>
        {typeof payload.sourceUrl === 'string' && payload.sourceUrl.startsWith('https://') ? <p><a href={payload.sourceUrl} target="_blank" rel="noreferrer"><T value={ui.importReview.source} /></a></p> : null}
        {typeof payload.gazetteReference === 'string' ? <p>{payload.gazetteReference}</p> : null}
      </Card> : null}
      <Card>
        <h2><T value={ui.admin.import.jobid.page.reviewActions} /></h2>
        <div className="review-action-grid">
        {!job.versionId && job.status === 'pending_review' && editor && payload?.outline && !job.outlineConfirmedBy ? <ActionForm action="confirm-outline" jobId={job.id} label={ui.importActions.confirmOutline} /> : null}
        {!job.versionId && job.status === 'pending_review' && editor && (!payload?.outline || job.outlineConfirmedBy) ? <ActionForm action="prepare" jobId={job.id} label={ui.importActions.prepareDraft} /> : null}
        {job.versionId && job.status === 'pending_review' && reviewer ? <>
          {prepared ? <ActionForm action="approve" jobId={job.id} label={ui.importActions.approveDraft} /> : null}
          <ActionForm action="reject" jobId={job.id} label={ui.importActions.rejectImport} />
        </> : null}
        {job.status === 'approved' && publisher ? <ActionForm action="publish" jobId={job.id} label={ui.importActions.publishVersion} /> : null}
        </div>
      </Card>
      {prepared ? <Card>
        <h2><T value={ui.admin.import.jobid.page.preparedDraftAsReadersWillSeeIt} /></h2>
        <OrderedContentTree entries={prepared.roots.map(node => ({ type: 'child' as const, node }))} outline={settings?.outline} />
      </Card> : null}
      <Disclosure summary={<T value={reviewUi.technicalDetails} />}>
        <dl className="technical-identifiers">
          <dt>Import</dt><dd><code>{job.id}</code></dd>
          {job.versionId ? <><dt><T value={ui.admin.import.jobid.page.draftVersion} /></dt><dd><code>{job.versionId}</code></dd></> : null}
          {prepared ? <>
            <dt><T value={ui.admin.import.jobid.page.contentGeneration} /></dt><dd>{prepared.generation}</dd>
            <dt><T value={ui.admin.import.jobid.page.settingsRevision} /></dt><dd><code>{prepared.settingsRevisionId ?? 'unbound'}</code></dd>
          </> : null}
        </dl>
      </Disclosure>
      {payload ? <details><summary><T value={ui.importReview.submittedContent} /></summary><ImportPreview payload={payload} /></details> : null}
      {decisions.length ? <Card><h2><T value={ui.admin.import.jobid.page.reviewDecisions} /></h2><ol>{decisions.map(decision => <li key={decision.id}>
        <strong>{decision.decision}</strong> · {new Date(decision.decidedAt).toLocaleString()}<p>{decision.reason}</p>
      </li>)}</ol></Card> : null}
      {job.errors.length > 0 ? (
        <Card>
          <h2><T value={ui.admin.import.jobid.page.errors} /></h2>
          <ul>
            {job.errors.map((error) => (
              <li key={`${error.code}-${error.message}`}>
                <code>{error.code}</code> — {error.message}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </WorkspacePage>
  );
}

function ActionForm({ action, jobId, label }: { action: 'confirm-outline' | 'prepare' | 'approve' | 'reject' | 'publish'; jobId: string; label: import('../../lib/messages').UiMessage }) {
  return <NavigatingActionForm action={transitionImportAction} className="review-action-form">
    <h3><T value={label} /></h3>
    <input type="hidden" name="jobId" value={jobId} />
    <input type="hidden" name="action" value={action} />
    {action === 'approve' || action === 'reject' ? <label className={["field", fieldStyles.field].join(' ')} htmlFor={`reason-${action}`}><T value={ui.admin.import.jobid.page.reviewReason} /><textarea id={`reason-${action}`} name="reason" minLength={10} maxLength={2000} required rows={3} /></label> : null}
    <Button variant={action === 'publish' ? 'primary' : undefined}><T value={label} /></Button>
  </NavigatingActionForm>;
}
