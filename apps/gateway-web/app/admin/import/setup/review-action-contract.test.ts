import { beforeEach, expect, it, vi } from 'vitest';
import { reviewSetupAction } from './actions';
import type { SetupProposal } from '../../../../lib/ingestion-api';
import { displayKinds, setupKinds } from '../../../../lib/setup-review';
const clients = vi.hoisted(() => ({
  currentUser: vi.fn(),
  requireSessionBearer: vi.fn(),
  getSetupProposal: vi.fn(),
  saveSetupDisplay: vi.fn(),
  requestSetupChanges: vi.fn(),
  transitionSetupProposal: vi.fn(),
}));
vi.mock('../../../../lib/session', () => ({
  currentUser: clients.currentUser,
  requireSessionBearer: clients.requireSessionBearer,
}));
vi.mock('../../../../lib/ingestion-api', async (original) => ({
  ...(await original<typeof import('../../../../lib/ingestion-api')>()),
  getSetupProposal: clients.getSetupProposal,
  saveSetupDisplay: clients.saveSetupDisplay,
  requestSetupChanges: clients.requestSetupChanges,
  transitionSetupProposal: clients.transitionSetupProposal,
}));
const proposal = {
  id: 'proposal/a',
  status: 'proposed',
  revision: 4,
  payload: {
    outline: { kinds: [{ kindCode: 'article', displayLabel: 'Article', root: true, allowedChildKinds: [] }] },
  },
} as unknown as SetupProposal;
function form(intent = 'confirm') {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    proposalId: proposal.id,
    revision: '4',
    intent,
    display: JSON.stringify(displayKinds(setupKinds(proposal.payload))),
  }))
    data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  clients.currentUser.mockResolvedValue({ roles: ['editor'] });
  clients.requireSessionBearer.mockResolvedValue('Bearer editor');
  clients.getSetupProposal.mockResolvedValue(proposal);
  clients.saveSetupDisplay.mockResolvedValue({ ...proposal, revision: 5 });
});
it('encodes forbidden destinations and stops before any downstream access', async () => {
  clients.currentUser.mockResolvedValue(null);
  expect(await reviewSetupAction(form())).toBe('/admin/import/setup/proposal%2Fa?error=forbidden');
  expect(clients.requireSessionBearer).not.toHaveBeenCalled();
});
it('keeps stale revision ahead of malformed intent and display errors', async () => {
  const data = form('bogus');
  data.set('revision', '3');
  data.set('display', '{');
  expect(await reviewSetupAction(data)).toContain('error=stale');
  expect(clients.saveSetupDisplay).not.toHaveBeenCalled();
});
it('skips display decoding when withdrawing and forbids withdrawal during confirmation', async () => {
  const data = form('withdraw');
  data.set('display', '{');
  expect(await reviewSetupAction(data)).toBe('/admin/import/setup/proposal%2Fa');
  expect(clients.transitionSetupProposal).toHaveBeenCalledWith(proposal.id, 'withdraw', 'Bearer editor', 4);
  expect(clients.saveSetupDisplay).not.toHaveBeenCalled();
  clients.getSetupProposal.mockResolvedValue({ ...proposal, status: 'confirming' });
  expect(await reviewSetupAction(data)).toContain('error=stale');
});
it('saves changed display once before confirming with the exact returned revision', async () => {
  const data = form();
  data.set('display', '[]');
  expect(await reviewSetupAction(data)).toBe('/admin/import/setup/proposal%2Fa');
  expect(clients.saveSetupDisplay).toHaveBeenCalledWith(proposal.id, [], 'Bearer editor', 4);
  expect(clients.transitionSetupProposal).toHaveBeenCalledWith(proposal.id, 'confirm', 'Bearer editor', 5);
  expect(clients.saveSetupDisplay.mock.invocationCallOrder[0]).toBeLessThan(
    clients.transitionSetupProposal.mock.invocationCallOrder[0],
  );
});
it('does not advance the command if display saving returns an unexpected revision', async () => {
  const data = form();
  data.set('display', '[]');
  clients.saveSetupDisplay.mockResolvedValue({ ...proposal, revision: 6 });
  expect(await reviewSetupAction(data)).toContain('error=stale');
  expect(clients.transitionSetupProposal).not.toHaveBeenCalled();
});
it('trims feedback before sending it and checks its length before saving display', async () => {
  const data = form('request-changes');
  data.set('message', '  Please revise the source.  ');
  expect(await reviewSetupAction(data)).toBe('/admin/import/setup/proposal%2Fa');
  expect(clients.requestSetupChanges).toHaveBeenCalledWith(
    proposal.id,
    'Please revise the source.',
    'Bearer editor',
    4,
  );
  data.set('message', ' short ');
  data.set('display', '[]');
  expect(await reviewSetupAction(data)).toContain('error=invalid');
  expect(clients.saveSetupDisplay).not.toHaveBeenCalled();
});
it('retains invalid array versus malformed JSON error distinctions', async () => {
  const data = form();
  data.set('display', '{}');
  expect(await reviewSetupAction(data)).toContain('error=invalid');
  data.set('display', '{');
  expect(await reviewSetupAction(data)).toContain('error=unavailable');
});
