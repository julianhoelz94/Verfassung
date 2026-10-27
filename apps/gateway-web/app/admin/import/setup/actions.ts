'use server';

import { currentUser, requireSessionBearer } from '../../../../lib/session';
import { getSetupProposal, requestSetupChanges, saveSetupDisplay, SetupActionError, transitionSetupProposal } from '../../../../lib/ingestion-api';
import { displayKinds, setupKinds } from '../../../../lib/setup-review';

export async function reviewSetupAction(formData: FormData): Promise<string> {
  const id = String(formData.get('proposalId') ?? '');
  const destination = `/admin/import/setup/${encodeURIComponent(id)}`;
  const user = await currentUser();
  if (!user?.roles.some(role => role === 'editor' || role === 'admin')) return `${destination}?error=forbidden`;
  try {
    const authorization = await requireSessionBearer();
    let proposal = await getSetupProposal(id, authorization);
    const revision = Number(formData.get('revision'));
    if (!proposal || !Number.isSafeInteger(revision) || revision !== proposal.revision) throw new SetupActionError('stale');
    const intent = String(formData.get('intent'));
    if (!['display', 'confirm', 'request-changes', 'withdraw'].includes(intent)) throw new SetupActionError('invalid');
    const message = String(formData.get('message') ?? '').trim();
    if (intent === 'request-changes' && (message.length < 10 || message.length > 4000)) throw new SetupActionError('invalid');
    if (proposal.status === 'confirming' && intent !== 'confirm') throw new SetupActionError('stale');
    if (intent !== 'withdraw' && proposal.status !== 'confirming') {
      const kinds = JSON.parse(String(formData.get('display') ?? 'null')) as unknown;
      if (!Array.isArray(kinds)) throw new SetupActionError('invalid');
      if (JSON.stringify(kinds) !== JSON.stringify(displayKinds(setupKinds(proposal.payload)))) {
        const savedRevision = proposal.revision + 1;
        proposal = await saveSetupDisplay(id, kinds, authorization, proposal.revision);
        if (proposal.revision !== savedRevision) throw new SetupActionError('stale');
      }
    }
    if (intent === 'request-changes') await requestSetupChanges(id, message, authorization, proposal.revision);
    if (intent === 'confirm' || intent === 'withdraw') await transitionSetupProposal(id, intent, authorization, proposal.revision);
    return destination;
  } catch (error) {
    return `${destination}?error=${error instanceof SetupActionError ? error.code : 'unavailable'}`;
  }
}
