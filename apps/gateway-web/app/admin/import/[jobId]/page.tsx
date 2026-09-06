import { notFound } from 'next/navigation';
import { AdminForbidden } from '../../../components/AdminForbidden';
import { Alert, Card } from '../../../components/ui';
import { PageMain } from '../../../components/PageMain';
import { requireAdminPage } from '../../../../lib/admin';
import { getImportJob } from '../../../../lib/ingestion-api';

type ImportJobPageProps = {
  params: { jobId: string };
};

export default async function ImportJobPage({ params }: ImportJobPageProps) {
  if (!(await requireAdminPage())) {
    return <AdminForbidden title="Import" />;
  }
  let job;
  try {
    job = await getImportJob(params.jobId);
  } catch {
    return (
      <PageMain>
        <h1>Import job</h1>
        <Alert tone="error">The import service is unavailable.</Alert>
      </PageMain>
    );
  }
  if (!job) {
    notFound();
  }
  const versionHref =
    job.status === 'completed' && job.versionId && job.isoCode
      ? `/countries/${encodeURIComponent(job.isoCode)}/versions/${encodeURIComponent(job.versionId)}`
      : null;
  return (
    <PageMain>
      {job.status === 'running' ? <meta httpEquiv="refresh" content="2" /> : null}
      <h1>Import job</h1>
      <p className="lede">Status: {job.status}</p>
      {job.status === 'running' ? <Alert>The import is still running. This page refreshes automatically.</Alert> : null}
      {job.status === 'failed' ? <Alert tone="error">The import failed.</Alert> : null}
      {job.status === 'completed' && versionHref ? (
        <Alert tone="success">
          Import completed.{' '}
          <a href={versionHref}>Open the published version</a>
        </Alert>
      ) : null}
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
