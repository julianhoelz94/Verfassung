import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../../../lib/session', () => ({ currentUser: vi.fn(), requireSessionBearer: vi.fn() }));
vi.mock('../../../../lib/ingestion-api', async importOriginal => ({ ...await importOriginal<typeof import('../../../../lib/ingestion-api')>(), getSetupProposal: vi.fn(), saveSetupDisplay: vi.fn(), transitionSetupProposal: vi.fn() }));
import { currentUser, requireSessionBearer } from '../../../../lib/session';
import { getSetupProposal, saveSetupDisplay, transitionSetupProposal, type SetupProposal } from '../../../../lib/ingestion-api';
import { reviewSetupAction } from './actions';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(currentUser).mockResolvedValue({ roles: ['editor'] } as Awaited<ReturnType<typeof currentUser>>);
  vi.mocked(requireSessionBearer).mockResolvedValue('Bearer editor');
  vi.mocked(getSetupProposal).mockResolvedValue({ id: 'proposal', status: 'confirming', revision: 4, payload: {} } as SetupProposal);
});
it('resumes the pinned confirmation without trying to change display settings', async () => {
  const data = new FormData();
  data.set('proposalId', 'proposal'); data.set('revision', '4'); data.set('intent', 'confirm'); data.set('display', 'malformed unrelated display');
  expect(await reviewSetupAction(data)).toBe('/admin/import/setup/proposal');
  expect(transitionSetupProposal).toHaveBeenCalledWith('proposal', 'confirm', 'Bearer editor', 4);
  expect(saveSetupDisplay).not.toHaveBeenCalled();
});
it('rejects display mutation or stale revision after confirmation has started', async () => {
  const data = new FormData(); data.set('proposalId', 'proposal'); data.set('revision', '4'); data.set('intent', 'display');
  expect(await reviewSetupAction(data)).toContain('error=stale');
  data.set('intent', 'confirm'); data.set('revision', '3');
  expect(await reviewSetupAction(data)).toContain('error=stale');
  expect(transitionSetupProposal).not.toHaveBeenCalled(); expect(saveSetupDisplay).not.toHaveBeenCalled();
});
