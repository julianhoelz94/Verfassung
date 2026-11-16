import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorLanding } from './EditorLanding';
import { listAllSessions } from '../../lib/editor-api';
import { listMyImportJobs, listAllImportJobs } from '../../lib/ingestion-api';
import { loadEditorInbox } from './editor-inbox-data';
import { getVersion } from '../../lib/api';
import { getJurisdiction } from '../../lib/migration-api';

vi.mock('../../lib/server-locale', () => ({ currentLocale: async () => 'en' }));
vi.mock('../../lib/session', () => ({ requireSessionBearer: async () => 'test-session' }));
vi.mock('../../lib/api', () => ({
  getCountry: async () => ({ name: 'Testland', constitutions: [{ id: 'constitution', title: 'Charter', versions: [{ id: 'source', versionLabel: '1949' }] }] }),
  getVersion: vi.fn(async () => ({ id: 'source', constitutionId: 'constitution', countryCode: 'XA', versionLabel: '1949' })),
}));
vi.mock('../../lib/editor-api', () => ({ listAllSessions: vi.fn(), editorErrorMessage: () => null }));
vi.mock('../../lib/migration-api', () => ({ getJurisdiction: vi.fn() }));
vi.mock('../../lib/ingestion-api', () => ({ listAllImportJobs: vi.fn(), listMyImportJobs: vi.fn() }));

describe('editor workspace handoffs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getJurisdiction).mockResolvedValue(null);
    vi.mocked(listAllSessions).mockResolvedValue(['open', 'reviewing', 'approved', 'published'].map(status => ({
      id: status, versionId: 'source', status, openedBy: 'author', openedAt: '2026-01-01', updatedAt: '2026-01-02', changedArticleCount: 1,
      hopKind: 'editorial_correction',
    })));
    vi.mocked(listAllImportJobs).mockResolvedValue([]);
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
    expect(html).toContain('More actions');
  });

  it('keeps reviewer and publisher queues limited to their next task', async () => {
    for (const [role, status] of [['reviewer', 'reviewing'], ['publisher', 'approved']]) {
      await EditorLanding({ userId: role, email: `${role}@example.test`, roles: [role] });
      expect(listAllSessions).toHaveBeenLastCalledWith({ status });
    }
  });

  it('retains sessions during an import outage and omits an incomplete queue count', async () => {
    vi.mocked(listMyImportJobs).mockRejectedValueOnce(new Error('offline'));
    const result = await loadEditorInbox({ userId: 'author', roles: ['editor'], queue: 'mine', archived: false, locale: 'en' });
    expect(result.rows).toHaveLength(4);
    expect(result.importsUnavailable).toBe(true);
    expect(result.sessionsUnavailable).toBe(false);
    expect(result.counts.mine).toBeNull();
  });

  it('deduplicates metadata reads without dropping sessions beyond the first hundred', async () => {
    vi.mocked(getVersion).mockClear();
    vi.mocked(listAllSessions).mockResolvedValueOnce(Array.from({ length: 121 }, (_, i) => ({ id: String(i), versionId: 'source', status: 'open', openedBy: 'author', openedAt: '2026-01-01', updatedAt: '2026-01-02', changedArticleCount: 0 })));
    const result = await loadEditorInbox({ userId: 'author', roles: ['editor'], queue: 'mine', archived: false, locale: 'en' });
    expect(result.rows).toHaveLength(121);
    expect(getVersion).toHaveBeenCalledTimes(1);
    expect(result.rows[120].constitution).toBe('Charter');
  });

  it('never exposes another author’s work through a personal result or a fabricated import label', async () => {
    vi.mocked(listMyImportJobs).mockResolvedValueOnce([
      { id: 'private-import-id', versionId: null, status: 'failed', errors: [], submittedBy: 'author' },
      { id: 'other-import', versionId: null, status: 'failed', errors: [], submittedBy: 'someone-else' },
    ]);
    const result = await loadEditorInbox({ userId: 'author', roles: ['editor'], queue: 'mine', archived: false, locale: 'en' });
    expect(result.rows.some(row => row.id === 'other-import')).toBe(false);
    expect(result.rows.find(row => row.id === 'private-import-id')?.version).not.toBe('private-import-id');
    expect(listAllImportJobs).not.toHaveBeenCalledWith(expect.anything(), 'pending_review');
  });

  it('keeps regional and historical ownership and pinned viewer links', async () => {
    vi.mocked(getVersion).mockResolvedValueOnce({ id: 'source', constitutionId: 'constitution', countryCode: null, jurisdictionId: 'region', versionLabel: '1949', effectiveDate: null, publicationStatus: 'published', languageCode: 'de' });
    const jurisdiction = { id: 'region', parentId: 'country', name: 'Former province', slug: 'province', kind: 'state', code: null, historical: true, existedFrom: '1900', existedUntil: '1950' };
    vi.mocked(getJurisdiction).mockResolvedValueOnce({ jurisdiction, ancestors: [{ ...jurisdiction, id: 'country', name: 'Testland', kind: 'country', code: 'XA', historical: false }], children: [], constitutions: [{ id: 'constitution', slug: 'charter', title: 'Regional charter', versions: [], lifecycleStatus: 'repealed' }] });
    const result = await loadEditorInbox({ userId: 'author', roles: ['editor'], queue: 'mine', archived: false, locale: 'en' });
    expect(result.rows[0]).toMatchObject({ country: 'Testland', constitution: 'Regional charter', jurisdiction: 'Former province', regional: true, historical: true, publicHref: '/jurisdictions/region/versions/source' });
  });

  it('keeps national reader ownership when Catalog also supplies its country jurisdiction', async () => {
    vi.mocked(getVersion).mockResolvedValueOnce({ id: 'source', constitutionId: 'constitution', countryCode: 'XA', jurisdictionId: 'national-owner', versionLabel: '1949', effectiveDate: null, publicationStatus: 'published', languageCode: 'de' });
    const result = await loadEditorInbox({ userId: 'author', roles: ['editor'], queue: 'mine', archived: false, locale: 'en' });
    expect(result.rows[0]).toMatchObject({ regional: false, publicHref: '/countries/XA/versions/source' });
    expect(getJurisdiction).not.toHaveBeenCalled();
  });

  it('names a former country from its own jurisdiction when it has no current country record', async () => {
    vi.mocked(getVersion).mockResolvedValueOnce({ id: 'source', constitutionId: 'constitution', countryCode: null, jurisdictionId: 'former-country', versionLabel: '1949', effectiveDate: null, publicationStatus: 'published', languageCode: 'de' });
    vi.mocked(getJurisdiction).mockResolvedValueOnce({ jurisdiction: { id: 'former-country', parentId: null, name: 'Former country', slug: 'former-country', kind: 'country', code: 'XF', historical: true, existedFrom: null, existedUntil: '1950' }, ancestors: [], children: [], constitutions: [{ id: 'constitution', slug: 'charter', title: 'Former charter', versions: [], lifecycleStatus: 'repealed' }] });
    const result = await loadEditorInbox({ userId: 'author', roles: ['editor'], queue: 'mine', archived: false, locale: 'en' });
    expect(result.rows[0]).toMatchObject({ countryKey: 'XF', country: 'Former country', constitution: 'Former charter', regional: false, historical: true, publicHref: '/jurisdictions/former-country/versions/source' });
  });

  it('keeps unprepared imports for different constitutions in separate groups', async () => {
    vi.mocked(listAllSessions).mockResolvedValueOnce([]);
    vi.mocked(listMyImportJobs).mockResolvedValueOnce(['First charter', 'Second charter'].map((title, index) => ({ id: String(index), versionId: null, status: 'pending_review', submittedBy: 'author', isoCode: 'XA', countryName: 'Testland', constitutionTitle: title, errors: [] })));
    const result = await loadEditorInbox({ userId: 'author', roles: ['editor'], queue: 'mine', archived: false, locale: 'en' });
    expect(result.rows.map(row => row.constitution)).toEqual(['First charter', 'Second charter']);
    expect(new Set(result.rows.map(row => row.constitutionKey)).size).toBe(2);
  });
});
