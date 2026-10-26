import { T } from '../../../../components/TranslationProvider';
import { ui } from '../../../../../lib/messages';
import { notFound } from 'next/navigation';
import { AdminForbidden } from '../../../../components/AdminForbidden';
import { Card, PageHeader } from '../../../../components/ui';
import { WorkspacePage } from '../../../../components/layout/templates';
import { SetupProposalReview } from '../SetupProposalReview';
import { currentUser, requireSessionBearer } from '../../../../../lib/session';
import { getSetupProposal } from '../../../../../lib/ingestion-api';
import { getJurisdiction } from '../../../../../lib/migration-api';
import { migrationUi } from '../../../../../lib/migration-messages';

type Props = { params: Promise<{ proposalId: string }>; searchParams: Promise<{ error?: string }> };

export default async function SetupProposalPage({ params, searchParams }: Props) {
  const user = await currentUser();
  if (!user || !user.roles.some(role => role === 'editor' || role === 'admin')) return <AdminForbidden title={ui.forbidden.constitutionSetup} />;
  const { proposalId } = await params;
  const proposal = await getSetupProposal(proposalId, await requireSessionBearer()).catch(() => null);
  if (!proposal) notFound();
  const error = (await searchParams).error;
  const payload = proposal.payload;
  const jurisdiction = typeof payload.jurisdictionId === 'string' ? await getJurisdiction(payload.jurisdictionId) : null;
  return <WorkspacePage width="content" header={<PageHeader title={<T value={ui.setupReview.title} />} />}>
    <Card>
      <h2><T value={ui.admin.import.setup.proposalid.page.sourceAndIdentity} /></h2>
      <p>{jurisdiction ? <><a href={`/jurisdictions/${jurisdiction.jurisdiction.id}`}>{jurisdiction.jurisdiction.name}</a>{jurisdiction.jurisdiction.historical ? <> · <T value={migrationUi.historical} /></> : null}</> : <>{String(payload.countryName ?? '')} ({String(payload.isoCode ?? '')})</>} · {String(payload.constitutionTitle ?? '')}</p>
      <p><T value={ui.admin.import.setup.proposalid.page.slug} />{" "}<code>{String(payload.constitutionSlug ?? '')}</code> <T value={ui.admin.import.setup.proposalid.page.language} />{" "}{String(payload.languageCode ?? '')}</p>
      <p><T value={ui.admin.import.setup.proposalid.page.source} />{" "}{typeof payload.sourceUrl === 'string' && payload.sourceUrl.startsWith('https://') ? <a href={payload.sourceUrl} rel="noreferrer" target="_blank">{payload.sourceUrl}</a> : String(payload.gazetteReference || '')}</p>

    </Card>
    <SetupProposalReview proposal={proposal} error={error} />
  </WorkspacePage>;
}
