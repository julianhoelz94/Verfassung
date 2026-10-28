import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorLanding } from './EditorLanding';
import { listAllSessions } from '../../lib/editor-api';
import { listMyImportJobs, listImportJobs } from '../../lib/ingestion-api';

vi.mock('../../lib/server-locale', () => ({ currentLocale: async () => 'en' }));
vi.mock('../../lib/session', () => ({ requireSessionBearer: async () => 'test-session' }));
vi.mock('../../lib/api', () => ({
  listCountries: async () => [{ isoCode: 'XA' }],
  getCountry: async () => ({ name: 'Testland', constitutions: [{ id: 'constitution', title: 'Charter', versions: [{ id: 'source', versionLabel: '1949' }] }] }),
  getVersion: async () => null,
}));
vi.mock('../../lib/editor-api', () => ({ listAllSessions: vi.fn(), editorErrorMessage: () => null }));
vi.mock('../../lib/ingestion-api', () => ({ listImportJobs: vi.fn(), listMyImportJobs: vi.fn() }));

describe('editor workspace handoffs', () => {
  beforeEach(() => {
    vi.mocked(listAllSessions).mockResolvedValue(['open', 'reviewing', 'approved', 'published'].map(status => ({
      id: status, versionId: 'source', status, openedBy: 'author', openedAt: '2026-01-01', updatedAt: '2026-01-02', changedArticleCount: 1,
      hopKind: 'editorial_correction',
    })));
    vi.mocked(listImportJobs).mockResolvedValue([]);
    vi.mocked(listMyImportJobs).mockResolvedValue([]);
  });

  it('keeps submitted and published work discoverable to its author', async () => {
    const html = renderToStaticMarkup(await EditorLanding({ userId: 'author', email: 'author@example.test', roles: ['editor'] }));
    expect(listAllSessions).toHaveBeenCalledWith({ openedBy: 'me', archived: false });
    for (const status of ['open', 'reviewing', 'approved', 'published']) expect(html).toContain(`sessionId=${status}`);
    expect(html).toContain('View progress');
    expect(html).toContain('Continue editing');
    expect(html).not.toContain('href="/editor?status=reviewing"');
  });

  it('filters imported and edited published work together and requests the archive separately', async () => {
    vi.mocked(listMyImportJobs).mockResolvedValue([
      { id: 'completed-import', status: 'completed', versionId: 'source', submittedBy: 'author', errors: [], versionLabel: 'Completed import' },
      { id: 'pending-import', status: 'pending_review', versionId: 'source', submittedBy: 'author', errors: [], versionLabel: 'Pending import' },
    ]);
    const html = renderToStaticMarkup(await EditorLanding({ userId: 'author', email: 'author@example.test', roles: ['editor'], workStatus: 'published', archived: true }));
    expect(listAllSessions).toHaveBeenLastCalledWith({ openedBy: 'me', archived: true });
    expect(listMyImportJobs).toHaveBeenLastCalledWith('test-session', true);
    expect(html).toContain('sessionId=published');
    expect(html).toContain('Completed import');
    expect(html).not.toContain('sessionId=open');
    expect(html).not.toContain('Pending import');
    expect(html).toContain('Restore');
  });

  it('keeps reviewer and publisher queues limited to their next task', async () => {
    for (const [role, status] of [['reviewer', 'reviewing'], ['publisher', 'approved']]) {
      await EditorLanding({ userId: role, email: `${role}@example.test`, roles: [role] });
      expect(listAllSessions).toHaveBeenLastCalledWith({ status });
    }
  });
});
