import { notFound } from 'next/navigation';
import { AdminForbidden } from '../../../../components/AdminForbidden';
import { Alert, Button, Card, PageHeader } from '../../../../components/ui';
import { PageMain } from '../../../../components/PageMain';
import { OutlineEditor } from '../../../constitutions/OutlineEditor';
import { currentUser, requireSessionBearer } from '../../../../../lib/session';
import { getSetupProposal } from '../../../../../lib/ingestion-api';
import type { OutlineKindWrite } from '../../../../../lib/api';
import { previewRoots } from '../../ImportPreview';
import { saveSetupOutlineAction, transitionSetupAction } from '../actions';

type Props = { params: Promise<{ proposalId: string }>; searchParams: Promise<{ error?: string }> };

export default async function SetupProposalPage({ params, searchParams }: Props) {
  const user = await currentUser();
  if (!user || !user.roles.some(role => role === 'editor' || role === 'admin')) return <AdminForbidden title="Constitution setup" />;
  const { proposalId } = await params;
  const proposal = await getSetupProposal(proposalId, await requireSessionBearer()).catch(() => null);
  if (!proposal) notFound();
  const error = (await searchParams).error;
  const payload = proposal.payload;
  const kinds = (payload.outline?.kinds ?? []) as OutlineKindWrite[];
  return <PageMain className="wide">
    <PageHeader title="Constitution setup proposal" meta={`Status: ${proposal.status}`} />
    {error ? <Alert tone="error">The setup action could not be completed. Check the proposal and your rights.</Alert> : null}
    <Card>
      <h2>Source and identity</h2>
      <p>{String(payload.countryName ?? '')} ({String(payload.isoCode ?? '')}) · {String(payload.constitutionTitle ?? '')}</p>
      <p>Slug: <code>{String(payload.constitutionSlug ?? '')}</code> · Language: {String(payload.languageCode ?? '')}</p>
      <p>Source: {String(payload.sourceUrl || payload.gazetteReference || '')}</p>
      <p>Proposed hierarchy: {kinds.map(kind => kind.displayLabel).join(' → ')}</p>
    </Card>
    {proposal.status === 'proposed' ? <>
      <OutlineEditor initial={kinds} sampleRoots={previewRoots(payload.sampleRoots)} action={saveSetupOutlineAction} submitLabel="Save proposed structure">
        <input type="hidden" name="proposalId" value={proposal.id} />
      </OutlineEditor>
      <Card><h2>Final review</h2><p>Confirm only after checking the source sample, labels, nesting and reader layout. Confirmation creates the constitution and returns a settings revision for the full upload.</p>
        <form action={transitionSetupAction}><input type="hidden" name="proposalId" value={proposal.id} /><input type="hidden" name="action" value="confirm" /><Button variant="primary">Confirm structure</Button></form>
        <form action={transitionSetupAction}><input type="hidden" name="proposalId" value={proposal.id} /><input type="hidden" name="action" value="withdraw" /><Button>Withdraw proposal</Button></form>
      </Card>
    </> : null}
    {proposal.status === 'confirmed' ? <Card><h2>Ready for content upload</h2>
      <p>Constitution ID: <code>{proposal.constitutionId}</code></p>
      <p>Settings revision: <code>{proposal.settingsRevisionId}</code></p>
      <p>Give both IDs to your chat client. The full import remains pending review after upload.</p>
    </Card> : null}
  </PageMain>;
}
