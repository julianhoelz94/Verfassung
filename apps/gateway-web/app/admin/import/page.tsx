import { NavigatingActionForm } from '../../components/NavigatingActionForm';
import { Disclosure } from '../../components/Disclosure';
import { LocalizedRegion } from '../../components/LocalizedRegion';
import { statusMessage } from '../../../lib/ui-labels';
import { reviewUi } from '../../../lib/ui-review-messages';
import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { AdminForbidden } from '../../components/AdminForbidden';
import { Alert, Badge, Button, Card, Input, PageHeader, TextArea } from '../../components/ui';
import { WorkspacePage } from '../../components/layout/templates';
import { currentUser, requireSessionBearer } from '../../../lib/session';
import { listImportJobs } from '../../../lib/ingestion-api';
import { createImportAction, createSetupProposalAction } from './actions';
import Link from 'next/link';
import { migrationUi } from '../../../lib/migration-messages';

type AdminImportPageProps = { searchParams: Promise<{ error?: string; mode?: string }> };

export default async function AdminImportPage({ searchParams }: AdminImportPageProps) {
  const params = await searchParams;
  const user = await currentUser();
  if (!user || !user.roles.some(role => ['editor', 'reviewer', 'publisher', 'admin'].includes(role))) return <AdminForbidden title={ui.forbidden.import} />;
  const canImport = user.roles.includes('editor') || user.roles.includes('admin');
  const jobs = await listImportJobs(await requireSessionBearer()).catch(() => null);
  const newStructure = params.mode === 'new';
  const error = params.error === 'forbidden' ? ui.admin.import.page.editorRightsRequiredForStaging : params.error === 'json' ? ui.admin.import.page.thatFileIsNotValidJson : params.error === 'invalid' ? ui.admin.import.page.theJsonIsMissingRequiredImportFields : ui.admin.import.page.theImportCouldNotBeStarted;
  return <WorkspacePage width="content" header={<PageHeader title={<T value={ui.attrs.adminImportPagePageHeaderTitleImport} />} meta={<T value={ui.attrs.adminImportPagePageHeaderMetaStage} />} />}>

    <p><Link href="/admin/migrations"><T value={migrationUi.migrations} /></Link></p>
    {params.error ? <Alert tone="error"><T value={error} /></Alert> : null}
    {canImport ? <>
      <h2 className="section-title"><T value={reviewUi.importChoice} /></h2>
      <LocalizedRegion as="nav" className="task-choices" label={reviewUi.chooseImportPath}>
        <a href="?mode=existing#upload" aria-current={!newStructure ? 'page' : undefined}><span className="task-number" aria-hidden="true">01</span><T value={reviewUi.existingStructure} /></a>
        <a href="?mode=new#structure" aria-current={newStructure ? 'page' : undefined}><span className="task-number" aria-hidden="true">02</span><T value={reviewUi.newStructure} /></a>
      </LocalizedRegion>
      <div className="import-layout">
      <Card id={newStructure ? 'structure' : 'upload'}>
        <h2><T value={newStructure ? reviewUi.newStructure : ui.admin.import.page.uploadAVersion} /></h2>
        <p className="muted"><T value={newStructure ? reviewUi.proposalHint : reviewUi.uploadHint} /></p>
        {newStructure ? <NavigatingActionForm action={createSetupProposalAction}>
          <Input label={<T value={reviewUi.proposalFile} />} id="proposalFile" name="proposalFile" type="file" accept="application/json,.json" />
          <Disclosure summary={<T value={reviewUi.pasteJson} />} open={Boolean(params.error)}>
            <TextArea label={<T value={ui.attrs.adminImportPageTextAreaLabelSetup} />} id="proposal" name="proposal" rows={10} spellCheck={false} />
          </Disclosure>
          <Button variant="primary"><T value={reviewUi.prepareStructure} /></Button>
        </NavigatingActionForm> : <NavigatingActionForm action={createImportAction}>
          <Input label={<T value={ui.attrs.adminImportPageInputLabelJSON} />} id="file" name="file" type="file" accept="application/json,.json" />
          <Disclosure summary={<T value={reviewUi.pasteJson} />} open={Boolean(params.error)}>
            <TextArea label={<T value={ui.attrs.adminImportPageTextAreaLabelImport} />} id="payload" name="payload" rows={12} spellCheck={false} />
          </Disclosure>
          <Button variant="primary"><T value={ui.admin.import.page.stageForReview} /></Button>
        </NavigatingActionForm>}
      </Card>
      <aside className="task-guidance">
        <h2><T value={reviewUi.importDetails} /></h2>
        <p><T value={ui.admin.import.page.useTheConfirmedConstitutionIdAndSettings} /></p>
        <Link href="/admin/constitutions"><T value={reviewUi.backToConstitutions} /></Link>
      </aside>
      </div>
    </> : null}
    <Card>
      <h2><T value={ui.admin.import.page.recentImports} /></h2>
      {!jobs ? <Alert tone="error"><T value={ui.errors.servicesUnavailable} /></Alert> : jobs.length === 0 ? <p className="muted"><T value={ui.admin.import.page.noImportsYet} /></p> : <ul className="task-list">{jobs.map(job => <li key={job.id}>
        <a href={`/editor?importJobId=${encodeURIComponent(job.id)}`}>{job.isoCode ?? <T value={ui.remainingStatus.constitution} />} <span className="muted">#{job.id.slice(-6)}</span></a>
        <Badge tone="info"><T value={statusMessage(job.status)} /></Badge>
      </li>)}</ul>}
    </Card>
  </WorkspacePage>;
}
