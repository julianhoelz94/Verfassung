import { NavigatingActionForm } from '../../components/NavigatingActionForm';
import { statusMessage } from '../../../lib/ui-labels';
import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
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
    return <AdminForbidden title={ui.forbidden.import} />;
  }
  const canImport = user.roles.includes('editor') || user.roles.includes('admin');
  const jobs = await listImportJobs(await requireSessionBearer()).catch(() => []);
  return (
    <PageMain className="wide">
      <PageHeader
        title={<T value={ui.attrs.adminImportPagePageHeaderTitleImport} />}
        meta={<T value={ui.attrs.adminImportPagePageHeaderMetaStage} />}
      />
      {searchParams.error === 'forbidden' ? (
        <Alert tone="error"><T value={ui.admin.import.page.editorRightsRequiredForStaging} /></Alert>
      ) : searchParams.error === 'json' ? (
        <Alert tone="error"><T value={ui.admin.import.page.thatFileIsNotValidJson} /></Alert>
      ) : searchParams.error === 'invalid' ? (
        <Alert tone="error"><T value={ui.admin.import.page.theJsonIsMissingRequiredImportFields} /></Alert>
      ) : searchParams.error ? (
        <Alert tone="error"><T value={ui.admin.import.page.theImportCouldNotBeStarted} /></Alert>
      ) : null}
      {canImport ? <Card>
        <h2><T value={ui.admin.import.page.newConstitutionSetup} /></h2>
        <p><T value={ui.admin.import.page.submitCountryTitleSourceProposedLevelsAnd} /></p>
        <NavigatingActionForm action={createSetupProposalAction}>
          <TextArea label={<T value={ui.attrs.adminImportPageTextAreaLabelSetup} />} id="proposal" name="proposal" rows={10} spellCheck={false} />
          <Button><T value={ui.admin.import.page.createPrivateSetupProposal} /></Button>
        </NavigatingActionForm>
      </Card> : null}
      {canImport ? <Card>
        <h2><T value={ui.admin.import.page.uploadAVersion} /></h2>
        <p><T value={ui.admin.import.page.useTheConfirmedConstitutionIdAndSettings} /></p>
        <NavigatingActionForm action={createImportAction}>
          <TextArea label={<T value={ui.attrs.adminImportPageTextAreaLabelImport} />} id="payload" name="payload" rows={16} spellCheck={false} />
          <Input label={<T value={ui.attrs.adminImportPageInputLabelJSON} />} id="file" name="file" type="file" accept="application/json,.json" />
          <Button variant="primary"><T value={ui.admin.import.page.stageForReview} /></Button>
        </NavigatingActionForm>
      </Card> : null}
      <Card>
        <h2><T value={ui.admin.import.page.recentImports} /></h2>
        {jobs.length === 0 ? <p><T value={ui.admin.import.page.noImportsYet} /></p> : <ul>{jobs.map(job => <li key={job.id}>
          <a href={`/admin/import/${encodeURIComponent(job.id)}`}>{job.isoCode ?? <T value={ui.remainingStatus.constitution} />} · {job.id}</a> — {<T value={statusMessage(job.status)} />}
        </li>)}</ul>}
      </Card>
    </PageMain>
  );
}
