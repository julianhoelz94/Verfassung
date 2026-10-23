import { loginHref } from '../../../../../lib/return-to';
import { statusMessage } from '../../../../../lib/ui-labels';
import { T } from '../../../../components/TranslationProvider';
import { ui } from '../../../../../lib/messages';
import { notFound, redirect } from 'next/navigation';
import { AdminForbidden } from '../../../../components/AdminForbidden';
import { Alert, Button, Card, PageHeader } from '../../../../components/ui';
import { WorkspacePage } from '../../../../components/layout/templates';
import { OutlineEditor } from '../../../constitutions/OutlineEditor';
import { currentUser, requireSessionBearer } from '../../../../../lib/session';
import { getSetupProposal } from '../../../../../lib/ingestion-api';
import type { OutlineKindWrite } from '../../../../../lib/api';
import { previewRoots } from '../../ImportPreview';
import { saveSetupOutlineAction, transitionSetupAction } from '../actions';
import { Stack } from '../../../../components/layout/Layout';

type Props = { params: Promise<{ proposalId: string }>; searchParams: Promise<{ error?: string }> };

export default async function SetupProposalPage({ params, searchParams }: Props) {
  const { proposalId } = await params;
  const user = await currentUser();
  if (!user) redirect(loginHref(`/admin/import/setup/${encodeURIComponent(proposalId)}`, await searchParams));
  if (!user.roles.some(role => role === 'editor' || role === 'admin')) return <AdminForbidden title={ui.forbidden.constitutionSetup} />;
  const proposal = await getSetupProposal(proposalId, await requireSessionBearer()).catch(() => null);
  if (!proposal) notFound();
  const error = (await searchParams).error;
  const payload = proposal.payload;
  const kinds = (payload.outline?.kinds ?? []) as OutlineKindWrite[];
  return <WorkspacePage width="content" header={<PageHeader title={<T value={ui.attrs.adminImportSetupProposalidPagePageHeader} />} meta={<><T value={ui.importActions.status} /> <T value={statusMessage(proposal.status)} /></>} />}>

    {error ? <Alert tone="error"><T value={ui.admin.import.setup.proposalid.page.theSetupActionCouldNotBeCompleted} /></Alert> : null}
    <Card>
      <h2><T value={ui.admin.import.setup.proposalid.page.sourceAndIdentity} /></h2>
      <p>{String(payload.countryName ?? '')} ({String(payload.isoCode ?? '')}) · {String(payload.constitutionTitle ?? '')}</p>
      <p><T value={ui.admin.import.setup.proposalid.page.slug} />{" "}<code>{String(payload.constitutionSlug ?? '')}</code> <T value={ui.admin.import.setup.proposalid.page.language} />{" "}{String(payload.languageCode ?? '')}</p>
      <p><T value={ui.admin.import.setup.proposalid.page.source} />{" "}{String(payload.sourceUrl || payload.gazetteReference || '')}</p>
      <p><T value={ui.admin.import.setup.proposalid.page.proposedHierarchy} />{" "}{kinds.map(kind => kind.displayLabel).join(' → ')}</p>
    </Card>
    {proposal.status === 'proposed' ? <>
      <OutlineEditor initial={kinds} sampleRoots={previewRoots(payload.sampleRoots)} action={saveSetupOutlineAction} submitLabel={ui.remainingStatus.saveProposedStructure}>
        <input type="hidden" name="proposalId" value={proposal.id} />
      </OutlineEditor>
      <Card><h2><T value={ui.admin.import.setup.proposalid.page.finalReview} /></h2><p><T value={ui.admin.import.setup.proposalid.page.confirmOnlyAfterCheckingTheSourceSample} /></p>
        <Stack as="form" action={transitionSetupAction}><input type="hidden" name="proposalId" value={proposal.id} /><input type="hidden" name="action" value="confirm" /><Button variant="primary"><T value={ui.admin.import.setup.proposalid.page.confirmStructure} /></Button></Stack>
        <Stack as="form" action={transitionSetupAction}><input type="hidden" name="proposalId" value={proposal.id} /><input type="hidden" name="action" value="withdraw" /><Button><T value={ui.admin.import.setup.proposalid.page.withdrawProposal} /></Button></Stack>
      </Card>
    </> : null}
    {proposal.status === 'confirmed' ? <Card><h2><T value={ui.admin.import.setup.proposalid.page.readyForContentUpload} /></h2>
      <p><T value={ui.admin.import.setup.proposalid.page.constitutionId} />{" "}<code>{proposal.constitutionId}</code></p>
      <p><T value={ui.admin.import.setup.proposalid.page.settingsRevision} />{" "}<code>{proposal.settingsRevisionId}</code></p>
      <p><T value={ui.admin.import.setup.proposalid.page.giveBothIdsToYourChatClient} /></p>
    </Card> : null}
  </WorkspacePage>;
}
