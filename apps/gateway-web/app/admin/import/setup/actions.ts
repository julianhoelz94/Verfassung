'use server';

import { currentUser, requireSessionBearer } from '../../../../lib/session';
import {
  getSetupProposal,
  requestSetupChanges,
  saveSetupDisplay,
  SetupActionError,
  type SetupProposal,
  transitionSetupProposal,
} from '../../../../lib/ingestion-api';
import { displayKinds, setupKinds } from '../../../../lib/setup-review';

export async function reviewSetupAction(formData: FormData): Promise<string> {
  const id = String(formData.get('proposalId') ?? '');
  const destination = `/admin/import/setup/${encodeURIComponent(id)}`;
  const user = await currentUser();
  if (!user?.roles.some((role) => role === 'editor' || role === 'admin'))
    return `${destination}?error=forbidden`;
  try {
    const authorization = await requireSessionBearer();
    const current = await getSetupProposal(id, authorization);
    const { proposal, intent, message } = reviewedCommand(formData, current);
    const reviewed = await saveReviewedDisplay(id, formData, proposal, intent, authorization);
    if (intent === 'request-changes')
      await requestSetupChanges(id, message, authorization, reviewed.revision);
    if (intent === 'confirm' || intent === 'withdraw')
      await transitionSetupProposal(id, intent, authorization, reviewed.revision);
    return destination;
  } catch (error) {
    return `${destination}?error=${error instanceof SetupActionError ? error.code : 'unavailable'}`;
  }
}

/** Checks the pinned revision before intent, feedback and in-flight confirmation policy. */
function reviewedCommand(formData: FormData, proposal: SetupProposal | null) {
  const revision = Number(formData.get('revision'));
  if (!proposal || !Number.isSafeInteger(revision) || revision !== proposal.revision)
    throw new SetupActionError('stale');
  const intent = String(formData.get('intent'));
  if (!['display', 'confirm', 'request-changes', 'withdraw'].includes(intent))
    throw new SetupActionError('invalid');
  const message = String(formData.get('message') ?? '').trim();
  if (intent === 'request-changes' && (message.length < 10 || message.length > 4000))
    throw new SetupActionError('invalid');
  if (proposal.status === 'confirming' && intent !== 'confirm') throw new SetupActionError('stale');
  return { proposal, intent, message };
}

/** Saves display changes before the command, requiring exactly one revision advance. */
async function saveReviewedDisplay(
  id: string,
  formData: FormData,
  proposal: SetupProposal,
  intent: string,
  authorization: string,
) {
  if (intent !== 'withdraw' && proposal.status !== 'confirming') {
    const kinds = JSON.parse(String(formData.get('display') ?? 'null')) as unknown;
    if (!Array.isArray(kinds)) throw new SetupActionError('invalid');
    if (JSON.stringify(kinds) !== JSON.stringify(displayKinds(setupKinds(proposal.payload)))) {
      const savedRevision = proposal.revision + 1;
      proposal = await saveSetupDisplay(id, kinds, authorization, proposal.revision);
      if (proposal.revision !== savedRevision) throw new SetupActionError('stale');
    }
  }
  return proposal;
}
