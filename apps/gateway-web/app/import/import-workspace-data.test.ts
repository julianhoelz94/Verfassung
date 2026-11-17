import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listAllImportJobs } from '../../lib/ingestion-api';
import { getMigrationRun, getMigrationRuns, type MigrationRun } from '../../lib/migration-review';
import { loadImportWorkspace } from './import-workspace-data';
vi.mock('../../lib/ingestion-api', () => ({ listAllImportJobs: vi.fn() }));
vi.mock('../../lib/migration-review', () => ({ getMigrationRun: vi.fn(), getMigrationRuns: vi.fn() }));
const job = { id: 'individual', status: 'pending_review', versionId: null, errors: [], countryName: 'Germany', constitutionTitle: 'Charter', versionLabel: '2026' };
const summary = { id: 'archive', title: 'Historical charters', coverage: { prepared: 2, staged: 4 } };
const run = { ...summary, items: [{ kind: 'snapshot', state: 'prepared', result: { jobId: 'member' } }, { kind: 'document', state: 'prepared', result: {} }, { kind: 'snapshot', state: 'staged', result: {} }] } as unknown as MigrationRun;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listAllImportJobs).mockResolvedValue([job, { ...job, id: 'member' }]);
  vi.mocked(getMigrationRuns).mockResolvedValue([summary]);
  vi.mocked(getMigrationRun).mockResolvedValue(run);
});
describe('import overview data ownership', () => {
  it('lists complete authorised jobs once, retaining packages and truthful snapshot progress', async () => {
    const data = await loadImportWorkspace('Bearer actor', 'en');
    expect(listAllImportJobs).toHaveBeenCalledWith('Bearer actor');
    expect(data.rows.map(row => row.id)).toEqual(['individual', 'archive']);
    expect(data.rows[1]).toMatchObject({ country: 'Germany', prepared: 1, total: 2, href: '/import/packages/archive' });
    expect(data.membershipUnavailable).toBe(false);
  });
  it('keeps known packages but withholds ambiguous single jobs if membership cannot be checked', async () => {
    vi.mocked(getMigrationRun).mockRejectedValue(new Error('offline'));
    const data = await loadImportWorkspace('Bearer actor', 'en');
    expect(data.rows.map(row => row.id)).toEqual(['archive']);
    expect(data.rows[0].total).toBeUndefined();
    expect(data.membershipUnavailable).toBe(true);
  });
  it('distinguishes an outage from a genuinely empty overview', async () => {
    vi.mocked(listAllImportJobs).mockResolvedValue([]); vi.mocked(getMigrationRuns).mockResolvedValue([]);
    expect(await loadImportWorkspace('actor', 'de')).toEqual({ rows: [], unavailable: false, membershipUnavailable: false });
    vi.mocked(listAllImportJobs).mockRejectedValue(new Error('offline'));
    expect((await loadImportWorkspace('actor', 'de')).unavailable).toBe(true);
    vi.mocked(getMigrationRuns).mockResolvedValue(null);
    expect((await loadImportWorkspace('actor', 'de')).membershipUnavailable).toBe(true);
  });
  it('retains readable fallbacks without publishing identifiers as titles', async () => {
    vi.mocked(getMigrationRuns).mockResolvedValue([]);
    vi.mocked(listAllImportJobs).mockResolvedValue([{ id: 'private-id', status: 'failed', versionId: null, errors: [] }]);
    const row = (await loadImportWorkspace('actor', 'en')).rows[0];
    expect(row.href).toContain('private-id'); expect(row.title).not.toContain('private-id');
    expect(row.period).not.toContain('private-id'); expect(row.country).not.toContain('private-id');
  });
});
