import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorLanding } from './EditorLanding';
import { listAllSessions } from '../../lib/editor-api';
import { listImportJobs } from '../../lib/ingestion-api';

vi.mock('../../lib/server-locale', () => ({ currentLocale: async () => 'en' }));
vi.mock('../../lib/session', () => ({ requireSessionBearer: async () => 'test-session' }));
vi.mock('../../lib/api', () => ({
  listCountries: async () => [{ isoCode: 'XA' }],
  getCountry: async () => ({ name: 'Testland', constitutions: [{ id: 'constitution', title: 'Charter', versions: [{ id: 'source', versionLabel: '1949' }] }] }),
  getVersion: async () => null,
}));
vi.mock('../../lib/editor-api', () => ({ listAllSessions: vi.fn(), editorErrorMessage: () => null }));
vi.mock('../../lib/ingestion-api', () => ({ listImportJobs: vi.fn() }));

describe('editor workspace handoffs', () => {
  beforeEach(() => {
    vi.mocked(listAllSessions).mockResolvedValue(['open', 'reviewing', 'approved', 'published'].map(status => ({
      id: status, versionId: 'source', status, openedBy: 'author', openedAt: '2026-01-01', updatedAt: '2026-01-02', changedArticleCount: 1,
      hopKind: 'editorial_correction',
    })));
    vi.mocked(listImportJobs).mockResolvedValue([]);
  });

  it('keeps submitted and published work discoverable to its author', async () => {
    const html = renderToStaticMarkup(await EditorLanding({ userId: 'author', email: 'author@example.test', roles: ['editor'] }));
    expect(listAllSessions).toHaveBeenCalledWith({ openedBy: 'me' });
    for (const status of ['open', 'reviewing', 'approved', 'published']) expect(html).toContain(`sessionId=${status}`);
    expect(html).toContain('View progress');
    expect(html).toContain('Continue editing');
    expect(html).not.toContain('href="/editor?status=reviewing"');
  });

  it('keeps reviewer and publisher queues limited to their next task', async () => {
    for (const [role, status] of [['reviewer', 'reviewing'], ['publisher', 'approved']]) {
      await EditorLanding({ userId: role, email: `${role}@example.test`, roles: [role] });
      expect(listAllSessions).toHaveBeenLastCalledWith({ status });
    }
  });
});
