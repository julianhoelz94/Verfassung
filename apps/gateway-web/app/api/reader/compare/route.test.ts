import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { getVersion, listAllUnits } from '../../../../lib/api';

vi.mock('../../../../lib/api', () => ({ getVersion: vi.fn(), listAllUnits: vi.fn() }));
const version = (id: string, patch = {}) => ({ id, publicationStatus: 'published', constitutionId: 'constitution', ...patch });
const request = (query = 'from=left&to=right&constitutionId=constitution') => new NextRequest('http://localhost/api/reader/compare?' + query);
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getVersion).mockImplementation(async id => version(id) as Awaited<ReturnType<typeof getVersion>>); vi.mocked(listAllUnits).mockResolvedValue([]); });
it('rejects missing or path-like identifiers before making a service request', async () => {
  for (const query of ['', 'from=a&to=b', 'from=../private&to=b&constitutionId=constitution', 'from=a&to=b&constitutionId=%2Fadmin']) expect((await GET(request(query))).status).toBe(400);
  expect(getVersion).not.toHaveBeenCalled(); expect(listAllUnits).not.toHaveBeenCalled();
});
it('compares only published snapshots belonging to the requested constitution', async () => {
  for (const record of [null, version('right', { publicationStatus: 'draft' }), version('right', { constitutionId: 'other' })]) {
    vi.mocked(getVersion).mockResolvedValueOnce(version('left') as never).mockResolvedValueOnce(record as never);
    expect((await GET(request())).status).toBe(404);
  }
  expect(listAllUnits).not.toHaveBeenCalled();
});
it('returns exact comparison direction with a private, non-cached response', async () => {
  vi.mocked(listAllUnits).mockResolvedValueOnce([{ id: 'left-root', logicalId: 'stable', articleNumber: '1', title: 'Rights', body: 'Original.', sortOrder: 0, versionId: 'left' }]).mockResolvedValueOnce([{ id: 'right-root', logicalId: 'stable', articleNumber: '1', title: 'Rights', body: 'Revised.', sortOrder: 0, versionId: 'right' }]);
  const response = await GET(request()); expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  const body = await response.json(); expect(body).toMatchObject({ from: 'left', to: 'right', changes: [{ kind: 'changed', fromRoot: 'left-root', toRoot: 'right-root' }] });
  expect(listAllUnits).toHaveBeenNthCalledWith(1, 'left', true); expect(listAllUnits).toHaveBeenNthCalledWith(2, 'right', true);
});
it('returns no differences for the same published snapshot without loading content', async () => {
  expect(await (await GET(request('from=left&to=left&constitutionId=constitution'))).json()).toEqual({ from: 'left', to: 'left', changes: [] });
  expect(listAllUnits).not.toHaveBeenCalled();
});
it('fails closed when a service is unavailable', async () => {
  vi.mocked(getVersion).mockRejectedValueOnce(new Error('offline')); expect((await GET(request())).status).toBe(503);
});
