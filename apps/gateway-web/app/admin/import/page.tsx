import { AdminForbidden } from '../../components/AdminForbidden';
import { Alert, Button, Card, Input, PageHeader, TextArea } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { currentUser, requireSessionBearer } from '../../../lib/session';
import { listImportJobs } from '../../../lib/ingestion-api';
import { createImportAction, createSetupProposalAction } from './actions';

type AdminImportPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminImportPage(props: AdminImportPageProps) {
  const searchParams = await props.searchParams;
  const user = await currentUser();
  if (!user || !user.roles.some(role => ['editor', 'reviewer', 'publisher', 'admin'].includes(role))) {
    return <AdminForbidden title="Import" />;
  }
  const canImport = user.roles.includes('editor') || user.roles.includes('admin');
  const jobs = await listImportJobs(await requireSessionBearer()).catch(() => []);
  return (
    <PageMain className="wide">
      <PageHeader
        title="Import a constitution"
        meta="Stage constitution content, inspect its structure, and send it through review before publication."
      />
      {searchParams.error === 'forbidden' ? (
        <Alert tone="error">Editor rights required for staging.</Alert>
      ) : searchParams.error === 'json' ? (
        <Alert tone="error">That file is not valid JSON.</Alert>
      ) : searchParams.error === 'invalid' ? (
        <Alert tone="error">The JSON is missing required import fields.</Alert>
      ) : searchParams.error ? (
        <Alert tone="error">The import could not be started.</Alert>
      ) : null}
      {canImport ? <Card>
        <h2>New constitution setup</h2>
        <p>Submit country, title, source, proposed levels, and up to five sample roots. Confirm the layout before uploading the full text.</p>
        <form action={createSetupProposalAction}>
          <TextArea label="Setup proposal JSON" id="proposal" name="proposal" rows={10} spellCheck={false} />
          <Button>Create private setup proposal</Button>
        </form>
      </Card> : null}
      {canImport ? <Card>
        <h2>Upload a version</h2>
        <p>Use the confirmed constitution ID and settings revision in the JSON. Each upload stays pending review.</p>
        <form action={createImportAction}>
          <TextArea label="Import JSON" id="payload" name="payload" rows={16} spellCheck={false} />
          <Input label="JSON file" id="file" name="file" type="file" accept="application/json,.json" />
          <Button variant="primary">Stage for review</Button>
        </form>
      </Card> : null}
      <Card>
        <h2>Recent imports</h2>
        {jobs.length === 0 ? <p>No imports yet.</p> : <ul>{jobs.map(job => <li key={job.id}>
          <a href={`/admin/import/${encodeURIComponent(job.id)}`}>{job.isoCode ?? 'Constitution'} · {job.id}</a> — {job.status}
        </li>)}</ul>}
      </Card>
    </PageMain>
  );
}
