import { notFound } from 'next/navigation';
import { AdminForbidden } from '../../../components/AdminForbidden';
import { Alert, Button, Card, PageHeader } from '../../../components/ui';
import { PageMain } from '../../../components/PageMain';
import { getImportJob, getImportPayload, getPreparedImportContent } from '../../../../lib/ingestion-api';
import { getVersionSettings } from '../../../../lib/api';
import { OrderedContentTree } from '../../../components/ConstitutionText';
import { currentUser, requireSessionBearer } from '../../../../lib/session';
import { transitionImportAction } from '../actions';
import { ImportPreview } from '../ImportPreview';

type ImportJobPageProps = {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function ImportJobPage(props: ImportJobPageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const user = await currentUser();
  if (!user || !user.roles.some(role => ['editor', 'reviewer', 'publisher', 'admin'].includes(role))) {
    return <AdminForbidden title="Import" />;
  }
  let job;
  try {
    job = await getImportJob(params.jobId, await requireSessionBearer());
  } catch {
    return (
      <PageMain>
        <PageHeader title="Import job" />
        <Alert tone="error">The import service is unavailable.</Alert>
      </PageMain>
    );
  }
  if (!job) {
    notFound();
  }
  const payload = await getImportPayload(params.jobId, await requireSessionBearer()).catch(() => null);
  const prepared = job.versionId ? await getPreparedImportContent(job.versionId, await requireSessionBearer()).catch(() => null) : null;
  const settings = job.versionId ? await getVersionSettings(job.versionId).catch(() => null) : null;
  const editor = user.roles.includes('editor') || user.roles.includes('admin');
  const reviewer = user.roles.includes('reviewer') || user.roles.includes('admin');
  const publisher = user.roles.includes('publisher') || user.roles.includes('admin');
  const ownSubmission = job.submittedBy === user.id;
  const ownApproval = job.approvedBy === user.id;
  const versionHref =
    job.status === 'completed' && job.versionId && job.isoCode
      ? `/countries/${encodeURIComponent(job.isoCode)}/versions/${encodeURIComponent(job.versionId)}`
      : null;
  return (
    <PageMain className="wide">
      <PageHeader title="Import job" meta={`Status: ${job.status}`} />
      {searchParams.error ? <Alert tone="error">The action could not be completed. Check the job status and your rights.</Alert> : null}
      {job.status === 'pending_review' ? <Alert>This import is pending review. It is not public.</Alert> : null}
      {job.status === 'failed' ? <Alert tone="error">The import failed.</Alert> : null}
      {job.status === 'completed' && versionHref ? (
        <Alert tone="success">
          Import completed.{' '}
          <a href={versionHref}>Open the published version</a>
        </Alert>
      ) : null}
      {payload ? <Card><ImportPreview payload={payload} /></Card> : null}
      {prepared ? <Card>
        <h2>Prepared draft as readers will see it</h2>
        <p>Content generation {prepared.generation}; settings revision {prepared.settingsRevisionId ?? 'unbound'}.</p>
        <OrderedContentTree entries={prepared.roots.map(node => ({ type: 'child' as const, node }))} outline={settings?.outline} />
      </Card> : null}
      <Card>
        <h2>Review actions</h2>
        {!job.versionId && job.status === 'pending_review' && editor ? <ActionForm action="prepare" jobId={job.id} label="Prepare unpublished draft" /> : null}
        {job.versionId && job.status === 'pending_review' && reviewer && !ownSubmission ? <>
          <ActionForm action="approve" jobId={job.id} label="Approve prepared draft" />
          <ActionForm action="reject" jobId={job.id} label="Reject import" />
        </> : null}
        {job.status === 'approved' && publisher && !ownApproval ? <ActionForm action="publish" jobId={job.id} label="Publish approved version" /> : null}
        {job.versionId && job.status !== 'completed' ? <p>Draft version: <code>{job.versionId}</code></p> : null}
      </Card>
      {job.errors.length > 0 ? (
        <Card>
          <h2>Errors</h2>
          <ul>
            {job.errors.map((error) => (
              <li key={`${error.code}-${error.message}`}>
                <code>{error.code}</code> — {error.message}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </PageMain>
  );
}

function ActionForm({ action, jobId, label }: { action: 'prepare' | 'approve' | 'reject' | 'publish'; jobId: string; label: string }) {
  return <form action={transitionImportAction}>
    <input type="hidden" name="jobId" value={jobId} />
    <input type="hidden" name="action" value={action} />
    <Button variant={action === 'publish' ? 'primary' : undefined}>{label}</Button>
  </form>;
}
