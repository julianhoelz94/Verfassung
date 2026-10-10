'use server';

import { redirect } from 'next/navigation';
import { currentUser, requireSessionBearer } from '../../../../lib/session';
import { getSetupProposal, transitionSetupProposal, updateSetupProposal } from '../../../../lib/ingestion-api';

function isEditor(roles: string[]) { return roles.includes('editor') || roles.includes('admin'); }

export async function saveSetupOutlineAction(formData: FormData): Promise<string> {
  const user = await currentUser();
  const id = String(formData.get('proposalId') ?? '');
  if (!user || !isEditor(user.roles)) throw new Error('Editor role required');
  const authorization = await requireSessionBearer();
  const proposal = await getSetupProposal(id, authorization);
  if (!proposal || proposal.status !== 'proposed') throw new Error('Proposal is not editable');
  const kinds = JSON.parse(String(formData.get('outline') ?? '[]')) as unknown;
  if (!Array.isArray(kinds)) throw new Error('Invalid outline');
  await updateSetupProposal(id, { ...proposal.payload, outline: { kinds } }, authorization);
  return `/admin/import/setup/${encodeURIComponent(id)}`;
}

export async function transitionSetupAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  const id = String(formData.get('proposalId') ?? '');
  const action = String(formData.get('action') ?? '');
  if (!user || !isEditor(user.roles) || !['confirm', 'withdraw'].includes(action)) redirect('/admin/import?error=forbidden');
  try {
    await transitionSetupProposal(id, action as 'confirm' | 'withdraw', await requireSessionBearer());
  } catch {
    redirect(`/admin/import/setup/${encodeURIComponent(id)}?error=transition`);
  }
  redirect(`/admin/import/setup/${encodeURIComponent(id)}`);
}
