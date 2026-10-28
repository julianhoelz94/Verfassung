import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../lib/session', () => ({ currentUser: vi.fn(), requireSessionBearer: vi.fn() }));
vi.mock('../../lib/editor-api', () => ({ manageSession: vi.fn() }));
vi.mock('../../lib/ingestion-api', () => ({ archiveImportJob: vi.fn() }));

import { revalidatePath } from 'next/cache';
import { currentUser, requireSessionBearer } from '../../lib/session';
import { manageSession } from '../../lib/editor-api';
import { archiveImportJob } from '../../lib/ingestion-api';
import { manageWorkAction } from './work-actions';

const id = '01900000-0000-4000-8000-000000008001';
function form(values: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ id, kind: 'session', action: 'archive', workStatus: 'published', archived: 'true', ...values })) data.set(key, value);
  return data;
}

describe('personal work commands', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(currentUser).mockResolvedValue({ id: 'author', roles: ['editor'] } as Awaited<ReturnType<typeof currentUser>>);
    vi.mocked(requireSessionBearer).mockResolvedValue('Bearer author');
    vi.mocked(manageSession).mockResolvedValue();
    vi.mocked(archiveImportJob).mockResolvedValue();
  });

  it('requires a signed-in user before issuing a write', async () => {
    vi.mocked(currentUser).mockResolvedValue(null);
    expect(await manageWorkAction(form())).toBe('/login');
    expect(manageSession).not.toHaveBeenCalled();
    expect(archiveImportJob).not.toHaveBeenCalled();
  });

  it.each([
    { id: '../another-session' }, { kind: 'catalog' }, { action: 'publish' }, { kind: 'import', action: 'discard' },
  ])('rejects an unsupported command before writing: %j', async values => {
    expect(await manageWorkAction(form(values))).toBe('/editor?mine=1&workStatus=published&archived=true&error=manage_failed');
    expect(manageSession).not.toHaveBeenCalled();
    expect(archiveImportJob).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each(['archive', 'restore', 'discard'])('sends session %s through the owner API and retains the applied filters', async action => {
    expect(await manageWorkAction(form({ action }))).toBe('/editor?mine=1&workStatus=published&archived=true');
    expect(manageSession).toHaveBeenCalledWith(id, action);
    expect(archiveImportJob).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith('/editor');
  });

  it.each([['archive', true], ['restore', false]] as const)('sends import %s with the current session credentials', async (action, archived) => {
    expect(await manageWorkAction(form({ kind: 'import', action }))).toBe('/editor?mine=1&workStatus=published&archived=true');
    expect(archiveImportJob).toHaveBeenCalledWith(id, archived, 'Bearer author');
    expect(manageSession).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith('/editor');
  });

  it('reports an unconfirmed service rejection without claiming success or exposing its details', async () => {
    vi.mocked(manageSession).mockRejectedValue(new Error('private upstream detail'));
    expect(await manageWorkAction(form())).toBe('/editor?mine=1&workStatus=published&archived=true&error=manage_failed');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('drops unrecognized filters and never accepts an external return destination', async () => {
    expect(await manageWorkAction(form({ workStatus: 'https://outside.example/', archived: 'anything', returnTo: '//outside.example' }))).toBe('/editor?mine=1');
    expect(manageSession).toHaveBeenCalledWith(id, 'archive');
  });
});
